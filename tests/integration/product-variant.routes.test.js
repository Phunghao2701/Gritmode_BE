import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { productRepository } from "../../src/repositories/product.repository.js";
import { productOptionRepository } from "../../src/repositories/product-option.repository.js";
import { productVariantRepository } from "../../src/repositories/product-variant.repository.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const adminToken = createAccessToken(
  { user_id: "00000000-0000-4000-8000-000000000001", role: "admin", session_id: 1 },
  { secret, expiresIn: "1h" },
);
const customerToken = createAccessToken(
  { user_id: "00000000-0000-4000-8000-000000000002", role: "customer", session_id: 2 },
  { secret, expiresIn: "1h" },
);

describe("product variant HTTP contract", () => {
  beforeEach(() => {
    mock.method(pool, "connect", async () => ({
      query: async () => ({ rows: [], rowCount: 1 }),
      release: () => {},
    }));
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      role: id === "00000000-0000-4000-8000-000000000001" ? "admin" : "customer",
      status: "active",
      email: "user@example.com",
    }));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test("admin variant endpoints require admin authentication", async () => {
    const endpoints = [
      ["get", "/api/v1/admin/products/1/variants"],
      ["get", "/api/v1/admin/product-variants/1"],
      ["post", "/api/v1/admin/products/1/variants"],
      ["patch", "/api/v1/admin/product-variants/1"],
      ["delete", "/api/v1/admin/product-variants/1"],
    ];

    for (const [method, url] of endpoints) {
      // Unauthenticated
      const unauthRes = await request(app)[method](url);
      assert.equal(unauthRes.status, 401);
      assert.equal(unauthRes.body.code, "AUTH_REQUIRED");

      // Customer forbidden
      const forbiddenRes = await request(app)[method](url).set("Authorization", `Bearer ${customerToken}`);
      assert.equal(forbiddenRes.status, 403);
      assert.equal(forbiddenRes.body.code, "FORBIDDEN_ROLE");
    }
  });

  test("get product variants returns 200 with variants list", async () => {
    mock.method(productRepository, "findById", async (id) => (id === 1 ? { product_id: 1 } : null));
    mock.method(productVariantRepository, "listByProduct", async (id) => [
      {
        product_variant_id: 101,
        product_id: id,
        sku: "DC-TS-BLK-M",
        price: 550000,
        quantity_stock: 10,
        quantity_reserved: 0,
        quantity_available: 10,
        option_values: [{ product_option_value_id: 1, name_option: "Color", value_option: "Black" }],
      },
    ]);

    const res = await request(app)
      .get("/api/v1/admin/products/1/variants")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].sku, "DC-TS-BLK-M");
  });

  test("create product variant validates payload and creates successfully", async () => {
    mock.method(productRepository, "findById", async (id) => (id === 1 ? { product_id: 1 } : null));
    mock.method(productVariantRepository, "findBySku", async () => null);
    mock.method(productOptionRepository, "listByProduct", async () => [
      { product_option_id: 10, name_option: "Color" },
    ]);
    mock.method(productVariantRepository, "findOptionValuesDetails", async (ids) => [
      { product_option_value_id: 1, product_option_id: 10, product_id: 1, name_option: "Color", value_option: "Black" },
    ]);
    mock.method(productVariantRepository, "findExistingCombinations", async () => []);
    mock.method(productVariantRepository, "create", async (productId, data) => ({
      product_variant_id: 101,
      product_id: productId,
      sku: data.sku,
      price: data.price,
    }));
    mock.method(productVariantRepository, "createOptionValuesMap", async () => {});
    mock.method(productVariantRepository, "initializeInventory", async () => {});
    mock.method(productVariantRepository, "findById", async (id) => ({
      product_variant_id: id,
      product_id: 1,
      sku: "DC-TS-BLK-M",
      price: 550000,
      quantity_stock: 0,
      quantity_reserved: 0,
      quantity_available: 0,
      option_values: [{ product_option_value_id: 1, name_option: "Color", value_option: "Black" }],
    }));

    const invalidRes = await request(app)
      .post("/api/v1/admin/products/1/variants")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ sku: "DC-TS-BLK-M", price: -100 });
    assert.equal(invalidRes.status, 400);

    const successRes = await request(app)
      .post("/api/v1/admin/products/1/variants")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        sku: "DC-TS-BLK-M",
        price: 550000,
        option_value_ids: [1],
      });

    assert.equal(successRes.status, 201);
    assert.equal(successRes.body.code, "VARIANT_CREATED");
    assert.equal(successRes.body.data.sku, "DC-TS-BLK-M");
  });

  test("get, update, delete variant endpoints work properly", async () => {
    mock.method(productVariantRepository, "findById", async (id) => (id === 101 ? {
      product_variant_id: 101,
      product_id: 1,
      sku: "DC-TS-BLK-M",
      price: 550000,
      quantity_stock: 5,
      quantity_reserved: 0,
      quantity_available: 5,
      option_values: [],
    } : null));
    mock.method(productVariantRepository, "findBySku", async () => null);
    mock.method(productVariantRepository, "update", async (id, data) => ({
      product_variant_id: id,
      sku: data.sku || "DC-TS-BLK-M",
      price: data.price || 550000,
    }));
    mock.method(productVariantRepository, "hasReferences", async () => false);
    mock.method(productVariantRepository, "delete", async () => true);

    const getRes = await request(app)
      .get("/api/v1/admin/product-variants/101")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.product_variant_id, 101);

    const updateRes = await request(app)
      .patch("/api/v1/admin/product-variants/101")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ price: 600000 });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.code, "VARIANT_UPDATED");

    const deleteRes = await request(app)
      .delete("/api/v1/admin/product-variants/101")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.code, "VARIANT_DELETED");
  });
});
