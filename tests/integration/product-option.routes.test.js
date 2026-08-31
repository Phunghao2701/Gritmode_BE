import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { productRepository } from "../../src/repositories/product.repository.js";
import { productOptionRepository } from "../../src/repositories/product-option.repository.js";

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

describe("product option HTTP contract", () => {
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

  test("admin option endpoints require admin authentication", async () => {
    const endpoints = [
      ["get", "/api/v1/admin/products/1/options"],
      ["post", "/api/v1/admin/products/1/options"],
      ["patch", "/api/v1/admin/product-options/1"],
      ["delete", "/api/v1/admin/product-options/1"],
      ["post", "/api/v1/admin/product-options/1/values"],
      ["patch", "/api/v1/admin/product-option-values/1"],
      ["delete", "/api/v1/admin/product-option-values/1"],
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

  test("get product options returns 200 with options array", async () => {
    mock.method(productRepository, "findById", async (id) => (id === 1 ? { product_id: 1 } : null));
    mock.method(productOptionRepository, "listByProduct", async (id) => [
      { product_option_id: 1, name_option: "Color", values: [{ product_option_value_id: 10, value_option: "Black" }] },
    ]);

    const res = await request(app)
      .get("/api/v1/admin/products/1/options")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].name_option, "Color");
  });

  test("create product option validates body and creates successfully", async () => {
    mock.method(productRepository, "findById", async (id) => (id === 1 ? { product_id: 1 } : null));
    mock.method(productOptionRepository, "findByNameAndProduct", async () => null);
    mock.method(productOptionRepository, "create", async (productId, data) => ({
      product_option_id: 1,
      product_id: productId,
      name_option: data.name_option,
    }));

    const invalidRes = await request(app)
      .post("/api/v1/admin/products/1/options")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    assert.equal(invalidRes.status, 400);

    const successRes = await request(app)
      .post("/api/v1/admin/products/1/options")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name_option: "Color" });
    assert.equal(successRes.status, 201);
    assert.equal(successRes.body.code, "OPTION_CREATED");
    assert.equal(successRes.body.data.name_option, "Color");
  });

  test("option values endpoints create, update, delete correctly", async () => {
    mock.method(productOptionRepository, "findById", async (id) => (id === 1 ? { product_option_id: 1, product_id: 10 } : null));
    mock.method(productOptionRepository, "findValueByNameAndOption", async () => null);
    mock.method(productOptionRepository, "createValue", async (optId, data) => ({
      product_option_value_id: 5,
      product_option_id: optId,
      value_option: data.value_option,
    }));
    mock.method(productOptionRepository, "findValueById", async (id) => (id === 5 ? { product_option_value_id: 5, product_option_id: 1, value_option: "Black" } : null));
    mock.method(productOptionRepository, "updateValue", async (id, data) => ({
      product_option_value_id: id,
      value_option: data.value_option,
    }));
    mock.method(productOptionRepository, "isValueUsedInVariants", async () => false);
    mock.method(productOptionRepository, "deleteValue", async () => true);

    const createRes = await request(app)
      .post("/api/v1/admin/product-options/1/values")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ value_option: "Black" });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.code, "OPTION_VALUE_CREATED");

    const updateRes = await request(app)
      .patch("/api/v1/admin/product-option-values/5")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ value_option: "Jet Black" });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.code, "OPTION_VALUE_UPDATED");

    const deleteRes = await request(app)
      .delete("/api/v1/admin/product-option-values/5")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.code, "OPTION_VALUE_DELETED");
  });
});
