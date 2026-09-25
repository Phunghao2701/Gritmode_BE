import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { productOptionRepository } from "../../../src/repositories/product-option.repository.js";
import { productVariantRepository } from "../../../src/repositories/product-variant.repository.js";

afterEach(() => mock.restoreAll());

describe("product option & variant repositories", () => {
  test("product option repository handles options CRUD, lookups and relations", async () => {
    const optionRows = [
      {
        product_option_id: 1,
        name_option: "Color",
        product_option_value_id: 10,
        value_option: "Black",
      },
      {
        product_option_id: 1,
        name_option: "Color",
        product_option_value_id: 11,
        value_option: "White",
      },
    ];

    const responses = [
      { rows: optionRows }, // listByProduct
      { rows: [{ product_option_id: 1, product_id: 100, name_option: "Color" }] }, // findById
      { rows: [{ product_option_id: 1, product_id: 100, name_option: "Color" }] }, // findByNameAndProduct
      { rows: [{ product_option_id: 1, product_id: 100, name_option: "Color" }] }, // create
      { rows: [{ product_option_id: 1, product_id: 100, name_option: "Colour" }] }, // update
      { rows: [{ count: "0" }] }, // isUsedInVariants false
      { rows: [{ count: "2" }] }, // isUsedInVariants true
      { rowCount: 1 }, // delete
      { rows: [{ product_option_value_id: 10, product_option_id: 1, value_option: "Black" }] }, // findValueById
      { rows: [{ product_option_value_id: 10, product_option_id: 1, value_option: "Black" }] }, // findValueByNameAndOption
      { rows: [{ product_option_value_id: 12, product_option_id: 1, value_option: "Red" }] }, // createValue
      { rows: [{ product_option_value_id: 10, product_option_id: 1, value_option: "Jet Black" }] }, // updateValue
      { rows: [{ count: "1" }] }, // isValueUsedInVariants true
      { rowCount: 1 }, // deleteValue
    ];

    let capturedQueries = [];
    mock.method(pool, "query", async (sql, params) => {
      capturedQueries.push({ sql, params });
      return responses.shift();
    });

    const options = await productOptionRepository.listByProduct(100);
    assert.equal(options.length, 1);
    assert.equal(options[0].name_option, "Color");
    assert.equal(options[0].values.length, 2);

    const single = await productOptionRepository.findById(1);
    assert.equal(single.product_option_id, 1);

    const byName = await productOptionRepository.findByNameAndProduct(100, "Color");
    assert.equal(byName.name_option, "Color");

    const created = await productOptionRepository.create(100, { name_option: "Color" });
    assert.equal(created.name_option, "Color");

    const updated = await productOptionRepository.update(1, { name_option: "Colour" });
    assert.equal(updated.name_option, "Colour");

    const isUsedFalse = await productOptionRepository.isUsedInVariants(1);
    assert.equal(isUsedFalse, false);

    const isUsedTrue = await productOptionRepository.isUsedInVariants(1);
    assert.equal(isUsedTrue, true);

    await productOptionRepository.delete(1);

    const val = await productOptionRepository.findValueById(10);
    assert.equal(val.value_option, "Black");

    const valByName = await productOptionRepository.findValueByNameAndOption(1, "Black");
    assert.equal(valByName.value_option, "Black");

    const valCreated = await productOptionRepository.createValue(1, { value_option: "Red" });
    assert.equal(valCreated.value_option, "Red");

    const valUpdated = await productOptionRepository.updateValue(10, { value_option: "Jet Black" });
    assert.equal(valUpdated.value_option, "Jet Black");

    const isValUsed = await productOptionRepository.isValueUsedInVariants(10);
    assert.equal(isValUsed, true);

    await productOptionRepository.deleteValue(10);
  });

  test("product variant repository handles variants CRUD, relations and combinations", async () => {
    const variantRow = {
      product_variant_id: 101,
      product_id: 100,
      sku: "DC-TS-BLK-M",
      price: 550000,
      quantity_stock: 10,
      quantity_reserved: 2,
      quantity_available: 8,
      option_values: JSON.stringify([
        { product_option_value_id: 1, name_option: "Color", value_option: "Black" },
        { product_option_value_id: 3, name_option: "Size", value_option: "M" },
      ]),
    };

    const responses = [
      { rows: [variantRow] }, // listByProduct
      { rows: [variantRow] }, // findById
      { rows: [{ product_variant_id: 101, sku: "DC-TS-BLK-M" }] }, // findBySku
      {
        rows: [
          { product_option_value_id: 1, product_option_id: 10, product_id: 100, name_option: "Color", value_option: "Black" },
          { product_option_value_id: 3, product_option_id: 20, product_id: 100, name_option: "Size", value_option: "M" },
        ],
      }, // findOptionValuesDetails
      {
        rows: [
          { product_variant_id: 101, option_value_ids: [1, 3] },
          { product_variant_id: 102, option_value_ids: [2, 3] },
        ],
      }, // findExistingCombinations
      { rows: [{ product_variant_id: 101, product_id: 100, sku: "DC-TS-BLK-M", price: 550000 }] }, // create
      { rowCount: 2 }, // createOptionValuesMap
      { rowCount: 1 }, // initializeInventory
      { rows: [{ product_variant_id: 101, product_id: 100, sku: "DC-TS-BLK-M-V2", price: 590000 }] }, // update
      { rowCount: 2 }, // replaceOptionValuesMap delete
      { rowCount: 2 }, // replaceOptionValuesMap insert
      { rows: [{ count: "1" }] }, // hasReferences true (cart/order)
      { rowCount: 1 }, // delete
    ];

    mock.method(pool, "query", async () => responses.shift());

    const list = await productVariantRepository.listByProduct(100);
    assert.equal(list.length, 1);
    assert.equal(list[0].sku, "DC-TS-BLK-M");
    assert.equal(list[0].option_values.length, 2);

    const single = await productVariantRepository.findById(101);
    assert.equal(single.product_variant_id, 101);

    const bySku = await productVariantRepository.findBySku("DC-TS-BLK-M");
    assert.equal(bySku.sku, "DC-TS-BLK-M");

    const optionDetails = await productVariantRepository.findOptionValuesDetails([1, 3]);
    assert.equal(optionDetails.length, 2);

    const combinations = await productVariantRepository.findExistingCombinations(100);
    assert.equal(combinations.length, 2);

    const created = await productVariantRepository.create(100, { sku: "DC-TS-BLK-M", price: 550000 });
    assert.equal(created.sku, "DC-TS-BLK-M");

    await productVariantRepository.createOptionValuesMap(101, [1, 3]);
    await productVariantRepository.initializeInventory(101);

    const updated = await productVariantRepository.update(101, { sku: "DC-TS-BLK-M-V2", price: 590000 });
    assert.equal(updated.sku, "DC-TS-BLK-M-V2");

    await productVariantRepository.replaceOptionValuesMap(101, [2, 3]);

    const hasRef = await productVariantRepository.hasReferences(101);
    assert.equal(hasRef, true);

    await productVariantRepository.delete(101);
  });
});
