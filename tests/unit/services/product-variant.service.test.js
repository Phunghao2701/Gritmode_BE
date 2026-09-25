import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createProductVariantService } from "../../../src/services/product-variant.service.js";

describe("product variant service", () => {
  const transaction = async (fn) => fn({});

  const sampleProductOptions = [
    { product_option_id: 10, name_option: "Color" },
    { product_option_id: 20, name_option: "Size" },
  ];

  const sampleOptionValuesDetails = [
    { product_option_value_id: 1, product_option_id: 10, product_id: 100, name_option: "Color", value_option: "Black" },
    { product_option_value_id: 2, product_option_id: 10, product_id: 100, name_option: "Color", value_option: "White" },
    { product_option_value_id: 3, product_option_id: 20, product_id: 100, name_option: "Size", value_option: "M" },
    { product_option_value_id: 4, product_option_id: 20, product_id: 100, name_option: "Size", value_option: "L" },
  ];

  test("getProductVariants returns variants or rejects missing product", async () => {
    const service = createProductVariantService({
      products: { findById: async (id) => (id === 100 ? { product_id: 100 } : null) },
      variants: {
        listByProduct: async (id) => [{ product_variant_id: 101, product_id: id, sku: "SKU-1" }],
      },
      transaction,
    });

    const list = await service.getProductVariants(100);
    assert.equal(list.length, 1);

    await assert.rejects(
      service.getProductVariants(999),
      (e) => e.code === "PRODUCT_NOT_FOUND" && e.statusCode === 404,
    );
  });

  test("getProductVariantById returns variant or rejects missing", async () => {
    const service = createProductVariantService({
      variants: {
        findById: async (id) => (id === 101 ? { product_variant_id: 101 } : null),
      },
      transaction,
    });

    const variant = await service.getProductVariantById(101);
    assert.equal(variant.product_variant_id, 101);

    await assert.rejects(
      service.getProductVariantById(999),
      (e) => e.code === "VARIANT_NOT_FOUND" && e.statusCode === 404,
    );
  });

  test("createProductVariant enforces SKU uniqueness and product existence", async () => {
    const service = createProductVariantService({
      products: { findById: async (id) => (id === 100 ? { product_id: 100 } : null) },
      variants: {
        findBySku: async (sku) => (sku === "EXISTING-SKU" ? { product_variant_id: 50 } : null),
      },
      transaction,
    });

    await assert.rejects(
      service.createProductVariant(999, { sku: "new-sku", price: 100000, option_value_ids: [1] }),
      (e) => e.code === "PRODUCT_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.createProductVariant(100, { sku: "existing-sku", price: 100000, option_value_ids: [1, 3] }),
      (e) => e.code === "SKU_EXISTS" && e.statusCode === 409,
    );
  });

  test("createProductVariant rejects product without options or invalid option count", async () => {
    const noOptionsService = createProductVariantService({
      products: { findById: async () => ({ product_id: 100 }) },
      options: { listByProduct: async () => [] },
      variants: {
        findBySku: async () => null,
      },
      transaction,
    });

    await assert.rejects(
      noOptionsService.createProductVariant(100, { sku: "SKU-1", price: 100000, option_value_ids: [1] }),
      (e) => e.code === "NO_PRODUCT_OPTIONS" && e.statusCode === 400,
    );

    const missingDetailsService = createProductVariantService({
      products: { findById: async () => ({ product_id: 100 }) },
      options: { listByProduct: async () => sampleProductOptions },
      variants: {
        findBySku: async () => null,
        findOptionValuesDetails: async () => [], // returns 0 rows
      },
      transaction,
    });

    await assert.rejects(
      missingDetailsService.createProductVariant(100, { sku: "SKU-1", price: 100000, option_value_ids: [999] }),
      (e) => e.code === "INVALID_OPTION_VALUE" && e.statusCode === 400,
    );
  });

  test("single-SKU product accepts one empty option combination", async () => {
    let existingCombinations = [];
    const service = createProductVariantService({
      products: { findById: async () => ({ product_id: 100 }) },
      options: { listByProduct: async () => [] },
      variants: {
        findBySku: async () => null,
        findExistingCombinations: async () => existingCombinations,
        create: async () => ({ product_variant_id: 101, product_id: 100, sku: "DEFAULT", price: 100000 }),
        createOptionValuesMap: async () => {}, initializeInventory: async () => {},
        findById: async () => ({ product_variant_id: 101, option_values: [] }),
      },
      audits: {}, transaction,
    });
    const created = await service.createProductVariant(100, { sku: "DEFAULT", price: 100000, option_value_ids: [] });
    assert.equal(created.product_variant_id, 101);
    existingCombinations = [{ product_variant_id: 101, option_value_ids: [] }];
    await assert.rejects(service.createProductVariant(100, { sku: "SECOND", price: 100000, option_value_ids: [] }), (error) => error.code === "VARIANT_COMBINATION_EXISTS");
  });

  test("createProductVariant rejects foreign option values", async () => {
    const service = createProductVariantService({
      products: { findById: async () => ({ product_id: 100 }) },
      options: { listByProduct: async () => sampleProductOptions },
      variants: {
        findBySku: async () => null,
        findOptionValuesDetails: async () => [
          { product_option_value_id: 99, product_option_id: 10, product_id: 200, name_option: "Color", value_option: "Blue" },
        ],
      },
      transaction,
    });

    await assert.rejects(
      service.createProductVariant(100, { sku: "NEW-SKU", price: 100000, option_value_ids: [99] }),
      (e) => e.code === "INVALID_OPTION_VALUE" && e.statusCode === 400,
    );
  });

  test("createProductVariant rejects multiple values from same option or missing options", async () => {
    const service = createProductVariantService({
      products: { findById: async () => ({ product_id: 100 }) },
      options: { listByProduct: async () => sampleProductOptions }, // 2 options: Color & Size
      variants: {
        findBySku: async () => null,
        findOptionValuesDetails: async (ids) =>
          sampleOptionValuesDetails.filter((v) => ids.includes(v.product_option_value_id)),
      },
      transaction,
    });

    // Multiple values from same option (Color: Black + Color: White)
    await assert.rejects(
      service.createProductVariant(100, { sku: "SKU-1", price: 100000, option_value_ids: [1, 2] }),
      (e) => e.code === "INVALID_OPTION_COMBINATION" && e.statusCode === 400,
    );

    // Incomplete option (only Color: Black, missing Size)
    await assert.rejects(
      service.createProductVariant(100, { sku: "SKU-2", price: 100000, option_value_ids: [1] }),
      (e) => e.code === "INCOMPLETE_OPTIONS" && e.statusCode === 400,
    );
  });

  test("createProductVariant rejects duplicate combinations regardless of ID ordering", async () => {
    const service = createProductVariantService({
      products: { findById: async () => ({ product_id: 100 }) },
      options: { listByProduct: async () => sampleProductOptions },
      variants: {
        findBySku: async () => null,
        findOptionValuesDetails: async (ids) =>
          sampleOptionValuesDetails.filter((v) => ids.includes(v.product_option_value_id)),
        findExistingCombinations: async () => [
          { product_variant_id: 101, option_value_ids: [1, 3] }, // Black (1), M (3)
        ],
      },
      transaction,
    });

    // Requesting [3, 1] (M, Black) should conflict with [1, 3]
    await assert.rejects(
      service.createProductVariant(100, { sku: "NEW-SKU", price: 100000, option_value_ids: [3, 1] }),
      (e) => e.code === "VARIANT_COMBINATION_EXISTS" && e.statusCode === 409,
    );
  });

  test("createProductVariant creates variant, option mapping, initializes inventory and audit log", async () => {
    let createdMap = null;
    let initializedInv = false;
    let recordedAudit = false;

    const service = createProductVariantService({
      products: { findById: async () => ({ product_id: 100 }) },
      options: { listByProduct: async () => sampleProductOptions },
      variants: {
        findBySku: async () => null,
        findOptionValuesDetails: async (ids) =>
          sampleOptionValuesDetails.filter((v) => ids.includes(v.product_option_value_id)),
        findExistingCombinations: async () => [],
        create: async (productId, data) => ({ product_variant_id: 105, product_id: productId, ...data }),
        createOptionValuesMap: async (id, ids) => { createdMap = { id, ids }; },
        initializeInventory: async () => { initializedInv = true; },
        findById: async (id) => ({ product_variant_id: id, sku: "NEW-SKU", price: 550000 }),
      },
      audits: { record: async () => { recordedAudit = true; } },
      transaction,
    });

    const result = await service.createProductVariant(100, { sku: "NEW-SKU", price: 550000, option_value_ids: [1, 3] }, "admin-id");
    assert.equal(result.product_variant_id, 105);
    assert.deepEqual(createdMap, { id: 105, ids: [1, 3] });
    assert.equal(initializedInv, true);
    assert.equal(recordedAudit, true);
  });

  test("updateProductVariant validates SKU, combinations and updates", async () => {
    let currentVariant = {
      product_variant_id: 101,
      product_id: 100,
      sku: "OLD-SKU",
      price: 500000,
      option_values: [],
    };

    let auditRecorded = false;
    const service = createProductVariantService({
      options: { listByProduct: async () => sampleProductOptions },
      variants: {
        findById: async (id) => (id === 101 ? currentVariant : null),
        findBySku: async (sku) => (sku === "TAKEN-SKU" ? { product_variant_id: 102 } : null),
        findOptionValuesDetails: async (ids) =>
          sampleOptionValuesDetails.filter((v) => ids.includes(v.product_option_value_id)),
        findExistingCombinations: async () => [
          { product_variant_id: 101, option_value_ids: [1, 3] },
          { product_variant_id: 102, option_value_ids: [2, 3] },
        ],
        update: async (id, data) => {
          currentVariant = { ...currentVariant, ...data };
          return currentVariant;
        },
        replaceOptionValuesMap: async () => {},
      },
      audits: { record: async () => { auditRecorded = true; } },
      transaction,
    });

    await assert.rejects(
      service.updateProductVariant(999, { price: 600000 }),
      (e) => e.code === "VARIANT_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.updateProductVariant(101, { sku: "TAKEN-SKU" }),
      (e) => e.code === "SKU_EXISTS" && e.statusCode === 409,
    );

    await assert.rejects(
      service.updateProductVariant(101, { option_value_ids: [2, 3] }),
      (e) => e.code === "VARIANT_COMBINATION_EXISTS" && e.statusCode === 409,
    );

    const updated = await service.updateProductVariant(101, { price: 550000, sku: "NEW-SKU", option_value_ids: [1, 4] }, "admin-id");
    assert.equal(updated.price, 550000);
    assert.equal(updated.sku, "NEW-SKU");
    assert.equal(auditRecorded, true);
  });

  test("deleteProductVariant rejects missing or in-use variant, deletes otherwise", async () => {
    let deletedAudit = false;
    const inUseService = createProductVariantService({
      variants: {
        findById: async (id) => (id === 101 ? { product_variant_id: 101 } : null),
        hasReferences: async (id) => id === 101,
        delete: async () => true,
      },
      audits: { record: async () => { deletedAudit = true; } },
      transaction,
    });

    await assert.rejects(
      inUseService.deleteProductVariant(999),
      (e) => e.code === "VARIANT_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      inUseService.deleteProductVariant(101),
      (e) => e.code === "VARIANT_IN_USE" && e.statusCode === 409,
    );

    const cleanService = createProductVariantService({
      variants: {
        findById: async (id) => ({ product_variant_id: id }),
        hasReferences: async () => false,
        delete: async () => true,
      },
      audits: { record: async () => { deletedAudit = true; } },
      transaction,
    });

    await cleanService.deleteProductVariant(105, "admin-id");
    assert.equal(deletedAudit, true);
  });
});
