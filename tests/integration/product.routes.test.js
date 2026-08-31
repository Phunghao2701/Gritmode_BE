import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createAccessToken } from "../../src/utils/tokens.js";
import pool from "../../src/config/database.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { productRepository } from "../../src/repositories/product.repository.js";
import { auditRepository } from "../../src/repositories/audit.repository.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const customerToken = createAccessToken(
  { user_id: "11111111-1111-4111-8111-111111111111", role: "customer" },
  { secret, expiresIn: "1h" },
);
const adminToken = createAccessToken(
  { user_id: "22222222-2222-4222-8222-222222222222", role: "admin" },
  { secret, expiresIn: "1h" },
);

describe("product HTTP contract", () => {
  beforeEach(() => {
    mock.method(pool, "connect", async () => ({
      query: async () => ({ rows: [], rowCount: 1 }),
      release: () => {},
    }));
    mock.method(userRepository, "findById", async (id) => {
      if (id === "22222222-2222-4222-8222-222222222222") {
        return { user_id: id, role: "admin", status: "active" };
      }
      return { user_id: id, role: "customer", status: "active" };
    });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test("public product listing allows guest access", async () => {
    mock.method(productRepository, "countProducts", async () => 1);
    mock.method(productRepository, "findProducts", async () => [
      {
        product_id: 1,
        name_product: "Logo T-Shirt",
        description: "Desc",
        min_price: 500000,
        max_price: 600000,
        thumbnail: "https://thumb.jpg",
        is_available: true,
      },
    ]);

    const res = await request(app).get("/api/v1/products");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.items.length, 1);
    assert.equal(res.body.data.pagination.total, 1);
  });

  test("public product listing validates query parameters", async () => {
    const res = await request(app).get("/api/v1/products?page=0&limit=999");
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "VALIDATION_ERROR");
  });

  test("public product detail validates ID and returns not found for missing", async () => {
    mock.method(productRepository, "findDetail", async () => null);

    const invalidIdRes = await request(app).get("/api/v1/products/invalid");
    assert.equal(invalidIdRes.status, 400);
    assert.equal(invalidIdRes.body.code, "INVALID_ID");

    const notFoundRes = await request(app).get("/api/v1/products/999");
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.body.code, "PRODUCT_NOT_FOUND");
  });

  test("admin endpoints require authentication", async () => {
    const endpoints = [
      ["post", "/api/v1/admin/products"],
      ["patch", "/api/v1/admin/products/1"],
      ["delete", "/api/v1/admin/products/1"],
    ];
    for (const [method, url] of endpoints) {
      const res = await request(app)[method](url);
      assert.equal(res.status, 401);
      assert.equal(res.body.code, "AUTH_REQUIRED");
    }
  });

  test("admin endpoints deny customer access with 403 Forbidden", async () => {
    const endpoints = [
      ["post", "/api/v1/admin/products"],
      ["patch", "/api/v1/admin/products/1"],
      ["delete", "/api/v1/admin/products/1"],
    ];
    for (const [method, url] of endpoints) {
      const res = await request(app)[method](url)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ name_product: "Denied" });
      assert.equal(res.status, 403);
      assert.equal(res.body.code, "FORBIDDEN_ROLE");
    }
  });

  test("admin create product validates body and creates successfully", async () => {
    mock.method(productRepository, "create", async (data) => ({
      product_id: 10,
      name_product: data.name_product,
      description: data.description,
    }));
    mock.method(auditRepository, "log", async () => ({}));

    // Validation error when name is missing
    const errRes = await request(app)
      .post("/api/v1/admin/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    assert.equal(errRes.status, 400);
    assert.equal(errRes.body.code, "VALIDATION_ERROR");

    // Success
    const successRes = await request(app)
      .post("/api/v1/admin/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name_product: "Admin Created", description: "Oversized" });
    assert.equal(successRes.status, 201);
    assert.equal(successRes.body.code, "PRODUCT_CREATED");
    assert.equal(successRes.body.data.name_product, "Admin Created");
  });
});
