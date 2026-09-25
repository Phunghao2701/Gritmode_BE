import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createProductOptionService } from "../../../src/services/product-option.service.js";

describe("product option service", () => {
  const transaction = async (fn) => fn({});

  test("getProductOptions returns options with values for valid product", async () => {
    const service = createProductOptionService({
      products: { findById: async (id) => (id === 100 ? { product_id: 100 } : null) },
      options: {
        listByProduct: async (id) => [
          { product_option_id: 1, name_option: "Color", values: [{ product_option_value_id: 1, value_option: "Black" }] },
        ],
      },
      transaction,
    });

    const result = await service.getProductOptions(100);
    assert.equal(result.length, 1);
    assert.equal(result[0].name_option, "Color");

    await assert.rejects(
      service.getProductOptions(999),
      (e) => e.code === "PRODUCT_NOT_FOUND" && e.statusCode === 404,
    );
  });

  test("createProductOption prevents duplicates and writes audit log", async () => {
    let createdAudit = false;
    const service = createProductOptionService({
      products: { findById: async (id) => (id === 100 ? { product_id: 100 } : null) },
      options: {
        findByNameAndProduct: async (productId, name) => (name.toLowerCase() === "color" ? { product_option_id: 1 } : null),
        create: async (productId, data) => ({ product_option_id: 2, product_id: productId, ...data }),
      },
      audits: { record: async () => { createdAudit = true; } },
      transaction,
    });

    await assert.rejects(
      service.createProductOption(999, { name_option: "Color" }, "admin-id"),
      (e) => e.code === "PRODUCT_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.createProductOption(100, { name_option: "color" }, "admin-id"),
      (e) => e.code === "OPTION_ALREADY_EXISTS" && e.statusCode === 409,
    );

    const created = await service.createProductOption(100, { name_option: "Size" }, "admin-id");
    assert.equal(created.name_option, "Size");
    assert.equal(createdAudit, true);
  });

  test("updateProductOption updates name and rejects duplicates", async () => {
    let auditUpdated = false;
    const service = createProductOptionService({
      options: {
        findById: async (id) => (id === 1 ? { product_option_id: 1, product_id: 100, name_option: "Color" } : null),
        findByNameAndProduct: async (productId, name) => (name.toLowerCase() === "size" ? { product_option_id: 2 } : null),
        update: async (id, data) => ({ product_option_id: id, ...data }),
      },
      audits: { record: async () => { auditUpdated = true; } },
      transaction,
    });

    await assert.rejects(
      service.updateProductOption(999, { name_option: "Size" }),
      (e) => e.code === "OPTION_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.updateProductOption(1, { name_option: "size" }),
      (e) => e.code === "OPTION_ALREADY_EXISTS" && e.statusCode === 409,
    );

    const updated = await service.updateProductOption(1, { name_option: "Colour" }, "admin-id");
    assert.equal(updated.name_option, "Colour");
    assert.equal(auditUpdated, true);
  });

  test("deleteProductOption rejects if option is missing or used in variants", async () => {
    let deletedAudit = false;
    const service = createProductOptionService({
      options: {
        findById: async (id) => (id === 1 ? { product_option_id: 1, product_id: 100 } : null),
        isUsedInVariants: async (id) => id === 1,
        delete: async () => true,
      },
      audits: { record: async () => { deletedAudit = true; } },
      transaction,
    });

    await assert.rejects(
      service.deleteProductOption(999),
      (e) => e.code === "OPTION_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.deleteProductOption(1),
      (e) => e.code === "OPTION_IN_USE" && e.statusCode === 409,
    );

    const safeService = createProductOptionService({
      options: {
        findById: async (id) => ({ product_option_id: id }),
        isUsedInVariants: async () => false,
        delete: async () => true,
      },
      audits: { record: async () => { deletedAudit = true; } },
      transaction,
    });

    await safeService.deleteProductOption(2, "admin-id");
    assert.equal(deletedAudit, true);
  });

  test("Option Values CRUD and in-use prevention", async () => {
    let auditVal = false;
    const service = createProductOptionService({
      options: {
        findById: async (id) => (id === 1 ? { product_option_id: 1, product_id: 100 } : null),
        findValueById: async (id) => (id === 10 ? { product_option_value_id: 10, product_option_id: 1, value_option: "Black" } : null),
        findValueByNameAndOption: async (optId, val) => (val.toLowerCase() === "white" ? { product_option_value_id: 20 } : null),
        createValue: async (optId, data) => ({ product_option_value_id: 11, product_option_id: optId, ...data }),
        updateValue: async (valId, data) => ({ product_option_value_id: valId, ...data }),
        isValueUsedInVariants: async (id) => id === 10,
        deleteValue: async () => true,
      },
      audits: { record: async () => { auditVal = true; } },
      transaction,
    });

    await assert.rejects(
      service.createOptionValue(999, { value_option: "white" }),
      (e) => e.code === "OPTION_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.createOptionValue(1, { value_option: "white" }),
      (e) => e.code === "OPTION_VALUE_ALREADY_EXISTS" && e.statusCode === 409,
    );

    const val = await service.createOptionValue(1, { value_option: "Red" }, "admin-id");
    assert.equal(val.value_option, "Red");
    assert.equal(auditVal, true);

    await assert.rejects(
      service.updateOptionValue(999, { value_option: "white" }),
      (e) => e.code === "OPTION_VALUE_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.updateOptionValue(10, { value_option: "white" }),
      (e) => e.code === "OPTION_VALUE_ALREADY_EXISTS" && e.statusCode === 409,
    );

    const updatedVal = await service.updateOptionValue(10, { value_option: "Jet Black" }, "admin-id");
    assert.equal(updatedVal.value_option, "Jet Black");

    await assert.rejects(
      service.deleteOptionValue(999),
      (e) => e.code === "OPTION_VALUE_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.deleteOptionValue(10),
      (e) => e.code === "OPTION_VALUE_IN_USE" && e.statusCode === 409,
    );

    const safeService = createProductOptionService({
      options: {
        findValueById: async (id) => ({ product_option_value_id: id }),
        isValueUsedInVariants: async () => false,
        deleteValue: async () => true,
      },
      audits: { record: async () => {} },
      transaction,
    });

    await safeService.deleteOptionValue(15, "admin-id");
  });
});
