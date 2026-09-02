import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  validateProductQuery,
  validateCreateProduct,
  validateCreateFullProduct,
  validateUpdateProduct,
} from "../../../src/utils/validation.js";
import { requireRole } from "../../../src/middlewares/auth.middleware.js";

describe("product validation primitives", () => {
  test("validateProductQuery provides default values and validates bounds", () => {
    const defaultRes = validateProductQuery({});
    assert.equal(defaultRes.ok, true);
    assert.equal(defaultRes.value.page, 1);
    assert.equal(defaultRes.value.limit, 20);
    assert.equal(defaultRes.value.sort, "newest");

    const customRes = validateProductQuery({
      page: "2",
      limit: "50",
      search: "  t-shirt ",
      category_id: "3",
      collection_id: "5",
      min_price: "100000",
      max_price: "500000",
      sort: "price_asc",
    });
    assert.equal(customRes.ok, true);
    assert.equal(customRes.value.page, 2);
    assert.equal(customRes.value.limit, 50);
    assert.equal(customRes.value.search, "t-shirt");
    assert.equal(customRes.value.category_id, 3);
    assert.equal(customRes.value.collection_id, 5);
    assert.equal(customRes.value.min_price, 100000);
    assert.equal(customRes.value.max_price, 500000);
    assert.equal(customRes.value.sort, "price_asc");

    const invalidBounds = validateProductQuery({
      page: "0",
      limit: "200",
      min_price: "500000",
      max_price: "100000",
      sort: "invalid_sort",
    });
    assert.equal(invalidBounds.ok, false);
    assert.ok(invalidBounds.errors.some((e) => e.field === "page"));
    assert.ok(invalidBounds.errors.some((e) => e.field === "limit"));
    assert.ok(invalidBounds.errors.some((e) => e.field === "max_price"));
    assert.ok(invalidBounds.errors.some((e) => e.field === "sort"));
  });

  test("validateCreateProduct requires name_product and rejects forbidden fields", () => {
    const missingName = validateCreateProduct({ description: "No name" });
    assert.equal(missingName.ok, false);
    assert.ok(missingName.errors.some((e) => e.field === "name_product"));

    const forbiddenFields = validateCreateProduct({
      name_product: "Valid Name",
      product_id: 123,
      created_at: "2026-01-01",
    });
    assert.equal(forbiddenFields.ok, false);
    assert.ok(forbiddenFields.errors.some((e) => e.field === "product_id"));

    const valid = validateCreateProduct({
      name_product: "  Logo T-Shirt  ",
      description: "  Cotton t-shirt ",
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.name_product, "Logo T-Shirt");
    assert.equal(valid.value.description, "Cotton t-shirt");
  });

  test("validateUpdateProduct supports partial update and rejects forbidden fields", () => {
    const valid = validateUpdateProduct({ name_product: "Updated Product" });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.name_product, "Updated Product");
    assert.equal(valid.value.description, undefined);

    const forbidden = validateUpdateProduct({ product_id: 999 });
    assert.equal(forbidden.ok, false);
  });

  test("validateCreateFullProduct normalizes a complete product payload", () => {
    const result = validateCreateFullProduct({
      name_product: "  Essential Tee ",
      description: " Cotton ",
      options: [
        { name_option: "Color", values: ["Black", "White"] },
        { name_option: "Size", values: ["M", "L"] },
      ],
      variants: [
        { sku: " tee-blk-m ", price: 450000, quantity_stock: 12, option_values: { color: "black", Size: "M" } },
      ],
      category_ids: [2],
      primary_category_id: 2,
      images: [{
        url_product_image: "https://example.com/black.jpg",
        option_value: { option_name: "color", value: "black" },
      }],
    });

    assert.equal(result.ok, true);
    assert.equal(result.value.name_product, "Essential Tee");
    assert.equal(result.value.variants[0].sku, "TEE-BLK-M");
    assert.deepEqual(result.value.variants[0].option_values, { Color: "black", Size: "M" });
    assert.deepEqual(result.value.images[0].option_value, { option_name: "Color", value: "black" });
  });

  test("validateCreateFullProduct rejects duplicate SKU, combination, and unknown values", () => {
    const result = validateCreateFullProduct({
      name_product: "Essential Tee",
      options: [{ name_option: "Color", values: ["Black"] }],
      variants: [
        { sku: "TEE-BLK", price: 1, quantity_stock: 1, option_values: { Color: "Black" } },
        { sku: "tee-blk", price: 1, quantity_stock: 1, option_values: { Color: "White" } },
      ],
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.field === "variants[1].sku"));
    assert.ok(result.errors.some((error) => error.field === "variants[1].option_values.Color"));
  });

  test("requireRole middleware allows authorized roles and denies unauthorized", () => {
    const middleware = requireRole("admin");

    let nextCalled = false;
    let nextError = null;

    // Customer should be forbidden
    const customerReq = { user: { role: "customer" } };
    middleware(customerReq, {}, (err) => {
      nextError = err;
    });
    assert.ok(nextError);
    assert.equal(nextError.statusCode, 403);
    assert.equal(nextError.code, "FORBIDDEN_ROLE");

    // Admin should pass
    const adminReq = { user: { role: "admin" } };
    middleware(adminReq, {}, (err) => {
      nextCalled = true;
      nextError = err;
    });
    assert.equal(nextCalled, true);
    assert.equal(nextError, undefined);
  });
});
