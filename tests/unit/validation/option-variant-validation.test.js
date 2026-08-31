import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCreateProductOption,
  validateUpdateProductOption,
  validateCreateOptionValue,
  validateUpdateOptionValue,
  validateCreateVariant,
  validateUpdateVariant,
} from "../../../src/utils/validation.js";

describe("option and variant validation primitives", () => {
  test("validateCreateProductOption validates required name_option and rejects forbidden fields", () => {
    const invalidEmpty = validateCreateProductOption({});
    assert.equal(invalidEmpty.ok, false);

    const invalidForbidden = validateCreateProductOption({
      name_option: "Color",
      product_id: 1,
    });
    assert.equal(invalidForbidden.ok, false);

    const valid = validateCreateProductOption({ name_option: "  Color  " });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.name_option, "Color");
  });

  test("validateUpdateProductOption validates name_option", () => {
    const invalid = validateUpdateProductOption({ name_option: "" });
    assert.equal(invalid.ok, false);

    const valid = validateUpdateProductOption({ name_option: "Size" });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.name_option, "Size");
  });

  test("validateCreateOptionValue & validateUpdateOptionValue validate value_option", () => {
    const createInvalid = validateCreateOptionValue({ product_option_id: 1 });
    assert.equal(createInvalid.ok, false);

    const createValid = validateCreateOptionValue({ value_option: "  Black  " });
    assert.equal(createValid.ok, true);
    assert.equal(createValid.value.value_option, "Black");

    const updateInvalid = validateUpdateOptionValue({});
    assert.equal(updateInvalid.ok, false);

    const updateValid = validateUpdateOptionValue({ value_option: "White" });
    assert.equal(updateValid.ok, true);
    assert.equal(updateValid.value.value_option, "White");
  });

  test("validateCreateVariant validates sku, price, and option_value_ids", () => {
    const invalidSku = validateCreateVariant({ price: 100000, option_value_ids: [1, 2] });
    assert.equal(invalidSku.ok, false);

    const invalidPrice = validateCreateVariant({ sku: "TEST-SKU", price: -50, option_value_ids: [1] });
    assert.equal(invalidPrice.ok, false);

    const invalidEmptyIds = validateCreateVariant({ sku: "TEST-SKU", price: 100000, option_value_ids: [] });
    assert.equal(invalidEmptyIds.ok, false);

    const invalidDuplicateIds = validateCreateVariant({ sku: "TEST-SKU", price: 100000, option_value_ids: [1, 1] });
    assert.equal(invalidDuplicateIds.ok, false);

    const invalidNonNumericIds = validateCreateVariant({ sku: "TEST-SKU", price: 100000, option_value_ids: ["abc"] });
    assert.equal(invalidNonNumericIds.ok, false);

    const valid = validateCreateVariant({
      sku: " dc-ts-blk-m ",
      price: "550000",
      option_value_ids: [1, 3],
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.sku, "DC-TS-BLK-M");
    assert.equal(valid.value.price, 550000);
    assert.deepEqual(valid.value.option_value_ids, [1, 3]);
  });

  test("validateUpdateVariant validates partial updates", () => {
    const empty = validateUpdateVariant({});
    assert.equal(empty.ok, false);

    const invalidForbidden = validateUpdateVariant({ product_variant_id: 10 });
    assert.equal(invalidForbidden.ok, false);

    const validPrice = validateUpdateVariant({ price: 600000 });
    assert.equal(validPrice.ok, true);
    assert.equal(validPrice.value.price, 600000);

    const validSku = validateUpdateVariant({ sku: "new-sku" });
    assert.equal(validSku.ok, true);
    assert.equal(validSku.value.sku, "NEW-SKU");

    const validOptions = validateUpdateVariant({ option_value_ids: [2, 4] });
    assert.equal(validOptions.ok, true);
    assert.deepEqual(validOptions.value.option_value_ids, [2, 4]);
  });
});
