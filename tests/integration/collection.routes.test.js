import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { productRepository } from "../../src/repositories/product.repository.js";
import { collectionRepository } from "../../src/repositories/collection.repository.js";

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

describe("collection HTTP contract", () => {
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

  test("public collection endpoints are accessible by guest and customer", async () => {
    mock.method(collectionRepository, "listVisible", async () => [
      { collection_id: 1, name_collection: "Summer Drop 2026", slug_collection: "summer-drop-2026", is_active: true },
    ]);
    mock.method(collectionRepository, "findById", async (id) => (id === 1 ? {
      collection_id: 1,
      name_collection: "Summer Drop 2026",
      is_active: true,
      start_at: null,
      end_at: null,
    } : null));
    mock.method(productRepository, "countProducts", async () => 0);
    mock.method(productRepository, "findProducts", async () => []);

    const listRes = await request(app).get("/api/v1/collections");
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.success, true);
    assert.equal(listRes.body.data.length, 1);

    const detailRes = await request(app).get("/api/v1/collections/1");
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data.collection_id, 1);

    const productsRes = await request(app).get("/api/v1/collections/1/products");
    assert.equal(productsRes.status, 200);
    assert.equal(productsRes.body.data.items.length, 0);
  });

  test("admin collection endpoints require admin authentication", async () => {
    const endpoints = [
      ["get", "/api/v1/admin/collections"],
      ["get", "/api/v1/admin/collections/1"],
      ["post", "/api/v1/admin/collections"],
      ["patch", "/api/v1/admin/collections/1"],
      ["patch", "/api/v1/admin/collections/1/status"],
      ["delete", "/api/v1/admin/collections/1"],
      ["post", "/api/v1/admin/collections/1/products"],
      ["delete", "/api/v1/admin/collections/1/products/100"],
      ["patch", "/api/v1/admin/collections/1/products/reorder"],
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

  test("admin collection CRUD, status, and product operations work properly", async () => {
    mock.method(collectionRepository, "listAll", async () => [
      { collection_id: 1, name_collection: "Dragon Ball Z", is_active: true },
    ]);
    mock.method(collectionRepository, "findBySlug", async () => null);
    mock.method(collectionRepository, "findById", async (id) => (id === 1 ? {
      collection_id: 1,
      name_collection: "Dragon Ball Z",
      is_active: true,
      start_at: null,
      end_at: null,
    } : null));
    mock.method(collectionRepository, "create", async (data) => ({ collection_id: 2, ...data }));
    mock.method(collectionRepository, "update", async (id, data) => ({ collection_id: id, ...data }));
    mock.method(collectionRepository, "updateStatus", async (id, status) => ({ collection_id: id, is_active: status }));
    mock.method(productRepository, "findById", async (id) => (id === 100 ? { product_id: 100 } : null));
    mock.method(collectionRepository, "findProductCollectionRelation", async (colId, prodId) => (colId === 1 && prodId === 100 ? null : { product_id: prodId, collection_id: colId }));
    mock.method(collectionRepository, "getMaxPosition", async () => 0);
    mock.method(collectionRepository, "addProduct", async () => ({ product_id: 100, collection_id: 1 }));
    mock.method(collectionRepository, "findCollectionProducts", async () => [{ product_id: 100, position_product_collection: 1 }]);
    mock.method(collectionRepository, "removeProduct", async () => true);
    mock.method(collectionRepository, "updateProductPositions", async () => {});

    const listRes = await request(app)
      .get("/api/v1/admin/collections")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(listRes.status, 200);

    const getRes = await request(app)
      .get("/api/v1/admin/collections/1")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(getRes.status, 200);

    const createRes = await request(app)
      .post("/api/v1/admin/collections")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name_collection: "New Drop", slug_collection: "new-drop" });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.code, "COLLECTION_CREATED");

    const updateRes = await request(app)
      .patch("/api/v1/admin/collections/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name_collection: "Dragon Ball Super" });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.code, "COLLECTION_UPDATED");

    const statusRes = await request(app)
      .patch("/api/v1/admin/collections/1/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: false });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.code, "COLLECTION_STATUS_UPDATED");

    const addRes = await request(app)
      .post("/api/v1/admin/collections/1/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ product_id: 100 });
    assert.equal(addRes.status, 201);
    assert.equal(addRes.body.code, "COLLECTION_PRODUCT_ADDED");

    mock.method(collectionRepository, "findProductCollectionRelation", async () => ({ product_id: 100, collection_id: 1 }));

    const reorderRes = await request(app)
      .patch("/api/v1/admin/collections/1/products/reorder")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ products: [{ product_id: 100, position_product_collection: 1 }] });
    assert.equal(reorderRes.status, 200);
    assert.equal(reorderRes.body.code, "COLLECTION_PRODUCTS_REORDERED");

    const removeRes = await request(app)
      .delete("/api/v1/admin/collections/1/products/100")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(removeRes.status, 200);
    assert.equal(removeRes.body.code, "COLLECTION_PRODUCT_REMOVED");

    const deleteRes = await request(app)
      .delete("/api/v1/admin/collections/1")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.code, "COLLECTION_DELETED");
  });
});
