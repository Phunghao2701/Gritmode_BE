import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { productRepository } from "../../src/repositories/product.repository.js";
import { categoryRepository } from "../../src/repositories/category.repository.js";

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

describe("category HTTP contract", () => {
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

  test("public category endpoints are open to guest and customer", async () => {
    mock.method(categoryRepository, "listActive", async () => [
      { category_id: 1, name_category: "Clothing", parent_category_id: null },
    ]);
    mock.method(categoryRepository, "findById", async (id) => (id === 1 ? { category_id: 1, is_active: true } : null));
    mock.method(productRepository, "countProducts", async () => 0);
    mock.method(productRepository, "findProducts", async () => []);

    const listRes = await request(app).get("/api/v1/categories");
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.success, true);
    assert.equal(listRes.body.data.length, 1);

    const detailRes = await request(app).get("/api/v1/categories/1");
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data.category_id, 1);

    const productsRes = await request(app).get("/api/v1/categories/1/products");
    assert.equal(productsRes.status, 200);
    assert.equal(productsRes.body.data.items.length, 0);
  });

  test("admin category endpoints require admin authentication", async () => {
    const endpoints = [
      ["get", "/api/v1/admin/categories"],
      ["post", "/api/v1/admin/categories"],
      ["patch", "/api/v1/admin/categories/1"],
      ["delete", "/api/v1/admin/categories/1"],
      ["patch", "/api/v1/admin/categories/1/status"],
      ["post", "/api/v1/admin/products/1/categories"],
      ["delete", "/api/v1/admin/products/1/categories/1"],
      ["patch", "/api/v1/admin/products/1/categories/1/primary"],
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

  test("admin category CRUD, status, and product assignment works properly", async () => {
    mock.method(categoryRepository, "listAll", async () => [{ category_id: 1, name_category: "Clothing" }]);
    mock.method(categoryRepository, "findBySlug", async () => null);
    mock.method(categoryRepository, "findById", async (id) => (id === 1 ? { category_id: 1, is_active: true } : null));
    mock.method(categoryRepository, "create", async (data) => ({ category_id: 2, ...data }));
    mock.method(categoryRepository, "update", async (id, data) => ({ category_id: id, ...data }));
    mock.method(categoryRepository, "updateStatus", async (id, status) => ({ category_id: id, is_active: status }));
    mock.method(productRepository, "findById", async (id) => (id === 100 ? { product_id: 100 } : null));
    mock.method(categoryRepository, "findProductCategoryRelation", async (prodId, catId) => (prodId === 100 && catId === 1 ? null : { product_id: prodId, category_id: catId }));
    mock.method(categoryRepository, "assignProduct", async () => ({ product_id: 100, category_id: 1, is_primary: true }));
    mock.method(categoryRepository, "findProductCategories", async () => [{ category_id: 1, is_primary: true }]);
    mock.method(categoryRepository, "setPrimaryCategory", async () => {});
    mock.method(categoryRepository, "removeProduct", async () => true);

    const getRes = await request(app)
      .get("/api/v1/admin/categories")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(getRes.status, 200);

    const createRes = await request(app)
      .post("/api/v1/admin/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name_category: "Tops", slug_category: "tops" });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.code, "CATEGORY_CREATED");

    const updateRes = await request(app)
      .patch("/api/v1/admin/categories/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name_category: "Clothing & Apparel" });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.code, "CATEGORY_UPDATED");

    const statusRes = await request(app)
      .patch("/api/v1/admin/categories/1/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: false });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.code, "CATEGORY_STATUS_UPDATED");

    const assignRes = await request(app)
      .post("/api/v1/admin/products/100/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category_id: 1, is_primary: true });
    assert.equal(assignRes.status, 201);
    assert.equal(assignRes.body.code, "PRODUCT_CATEGORY_ASSIGNED");

    // Re-mock relation to exist for setPrimary and remove
    mock.method(categoryRepository, "findProductCategoryRelation", async () => ({ product_id: 100, category_id: 1 }));

    const primaryRes = await request(app)
      .patch("/api/v1/admin/products/100/categories/1/primary")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(primaryRes.status, 200);
    assert.equal(primaryRes.body.code, "PRIMARY_CATEGORY_SET");

    const removeRes = await request(app)
      .delete("/api/v1/admin/products/100/categories/1")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(removeRes.status, 200);
    assert.equal(removeRes.body.code, "PRODUCT_CATEGORY_REMOVED");
  });
});
