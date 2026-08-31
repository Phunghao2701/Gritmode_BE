import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { productRepository } from "../../src/repositories/product.repository.js";
import { productImageRepository } from "../../src/repositories/product-image.repository.js";
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

describe("product image HTTP contract", () => {
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

  test("admin image endpoints require admin authentication", async () => {
    const endpoints = [
      ["get", "/api/v1/admin/products/1/images"],
      ["post", "/api/v1/admin/products/1/images"],
      ["patch", "/api/v1/admin/products/1/images/reorder"],
      ["patch", "/api/v1/admin/product-images/1"],
      ["delete", "/api/v1/admin/product-images/1"],
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

  test("get product images returns 200 with images list", async () => {
    mock.method(productRepository, "findById", async (id) => (id === 1 ? { product_id: 1 } : null));
    mock.method(productImageRepository, "listByProduct", async (id) => [
      {
        product_image_id: 10,
        product_id: id,
        product_option_value_id: null,
        url_product_image: "https://example.com/size-chart.jpg",
        alt_product_image: "Size Chart",
        position_product_image: 1,
      },
    ]);

    const res = await request(app)
      .get("/api/v1/admin/products/1/images")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].url_product_image, "https://example.com/size-chart.jpg");
  });

  test("create product image validates body and creates image", async () => {
    mock.method(productRepository, "findById", async (id) => (id === 1 ? { product_id: 1 } : null));
    mock.method(productOptionRepository, "findValueById", async (id) => (id === 5 ? { product_option_value_id: 5, product_id: 1 } : null));
    mock.method(productImageRepository, "getMaxPosition", async () => 2);
    mock.method(productImageRepository, "create", async (productId, data) => ({
      product_image_id: 100,
      product_id: productId,
      ...data,
    }));

    const invalidRes = await request(app)
      .post("/api/v1/admin/products/1/images")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    assert.equal(invalidRes.status, 400);

    const successRes = await request(app)
      .post("/api/v1/admin/products/1/images")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        url_product_image: "https://example.com/black-front.jpg",
        product_option_value_id: 5,
        alt_product_image: "Black Front",
      });

    assert.equal(successRes.status, 201);
    assert.equal(successRes.body.code, "IMAGE_CREATED");
    assert.equal(successRes.body.data.position_product_image, 3);
  });

  test("update, delete, and reorder image endpoints work properly", async () => {
    mock.method(productRepository, "findById", async (id) => (id === 1 ? { product_id: 1 } : null));
    mock.method(productImageRepository, "findById", async (id) => (id === 100 ? { product_image_id: 100, product_id: 1 } : null));
    mock.method(productImageRepository, "update", async (id, data) => ({ product_image_id: id, ...data }));
    mock.method(productImageRepository, "delete", async () => true);
    mock.method(productImageRepository, "findImagesByIds", async (ids) => ids.map((id) => ({ product_image_id: id, product_id: 1 })));
    mock.method(productImageRepository, "updatePositions", async () => {});
    mock.method(productImageRepository, "listByProduct", async () => [
      { product_image_id: 100, position_product_image: 1 },
    ]);

    const updateRes = await request(app)
      .patch("/api/v1/admin/product-images/100")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ alt_product_image: "Updated Alt" });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.code, "IMAGE_UPDATED");

    const reorderRes = await request(app)
      .patch("/api/v1/admin/products/1/images/reorder")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        images: [{ product_image_id: 100, position_product_image: 1 }],
      });
    assert.equal(reorderRes.status, 200);
    assert.equal(reorderRes.body.code, "IMAGES_REORDERED");

    const deleteRes = await request(app)
      .delete("/api/v1/admin/product-images/100")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.code, "IMAGE_DELETED");
  });
});
