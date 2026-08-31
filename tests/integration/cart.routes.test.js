import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { cartRepository } from "../../src/repositories/cart.repository.js";
import { productVariantRepository } from "../../src/repositories/product-variant.repository.js";
import { inventoryRepository } from "../../src/repositories/inventory.repository.js";
import pool from "../../src/config/database.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const token = createAccessToken(
  { user_id: "00000000-0000-4000-8000-000000000002", role: "customer", session_id: 2 },
  { secret: process.env.JWT_SECRET, expiresIn: "1h" },
);
const cart = { cart_id: 10, status_cart: "active", guest_token: "guest_valid_token_123456" };
const item = {
  cart_item_id: 1, product_id: 20, product_variant_id: 101, name_product: "T-Shirt",
  sku: "TS-M", variant: "Black / M", image: null, price: 100000, quantity: 2,
  quantity_available: 5,
};

describe("cart HTTP contract", () => {
  beforeEach(() => {
    mock.method(pool, "connect", async () => ({
      query: async () => ({ rows: [], rowCount: 1 }),
      release: () => {},
    }));
    mock.method(userRepository, "findById", async (id) => ({ user_id: id, email: "u@test.dev", role: "customer", status: "active" }));
    mock.method(cartRepository, "findActiveByOwner", async () => cart);
    mock.method(cartRepository, "getDetailedItems", async () => [item]);
  });
  afterEach(() => mock.restoreAll());

  test("guest gets cart with X-Guest-Token", async () => {
    const res = await request(app).get("/api/v1/cart").set("X-Guest-Token", "guest_valid_token_123456");
    assert.equal(res.status, 200);
    assert.equal(res.body.code, "CART_RETRIEVED");
    assert.equal(res.body.data.summary.subtotal, 200000);
  });

  test("authenticated user gets cart without guest token", async () => {
    const res = await request(app).get("/api/v1/cart").set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.cart_id, 10);
  });

  test("invalid bearer token is rejected instead of treated as guest", async () => {
    const res = await request(app).get("/api/v1/cart").set("Authorization", "Bearer invalid");
    assert.equal(res.status, 401);
    assert.equal(res.body.code, "TOKEN_INVALID");
  });

  test("guest can add an item without login", async () => {
    mock.method(cartRepository, "findItem", async () => null);
    mock.method(cartRepository, "upsertItem", async () => ({}));
    mock.method(cartRepository, "lockInventory", async () => ({ quantity_available: 5 }));
    mock.method(productVariantRepository, "findById", async () => ({ product_variant_id: 101 }));
    mock.method(inventoryRepository, "findByVariantId", async () => ({ quantity_available: 5 }));

    const res = await request(app)
      .post("/api/v1/cart/items")
      .set("X-Guest-Token", "guest_valid_token_123456")
      .send({ product_variant_id: 101, quantity: 2 });
    assert.equal(res.status, 201);
    assert.equal(res.body.code, "CART_ITEM_ADDED");
  });

  test("add item validates positive integer input", async () => {
    const res = await request(app).post("/api/v1/cart/items").send({ product_variant_id: 0, quantity: -1 });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "VALIDATION_ERROR");
  });

  test("PATCH and DELETE require a guest token when unauthenticated", async () => {
    const patchRes = await request(app).patch("/api/v1/cart/items/1").send({ quantity: 2 });
    const deleteRes = await request(app).delete("/api/v1/cart/items/1");
    assert.equal(patchRes.status, 400);
    assert.equal(deleteRes.status, 400);
    assert.equal(patchRes.body.code, "GUEST_TOKEN_REQUIRED");
  });
});
