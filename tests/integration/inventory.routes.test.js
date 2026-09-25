import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { productVariantRepository } from "../../src/repositories/product-variant.repository.js";
import { inventoryRepository } from "../../src/repositories/inventory.repository.js";

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

const makeInventory = (overrides = {}) => ({
  inventory_id: 1,
  product_variant_id: 101,
  product_id: 1,
  name_product: "Logo T-Shirt",
  sku: "DC-TS-BLK-M",
  quantity_stock: 10,
  quantity_reserved: 2,
  quantity_available: 8,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe("inventory HTTP contract", () => {
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

  // ── Auth guards ──────────────────────────────────────────────────────────
  test("admin inventory endpoints require admin authentication", async () => {
    const endpoints = [
      ["get", "/api/v1/admin/inventory"],
      ["get", "/api/v1/admin/product-variants/101/inventory"],
      ["patch", "/api/v1/admin/product-variants/101/inventory"],
    ];

    for (const [method, url] of endpoints) {
      // Unauthenticated → 401
      const unauthRes = await request(app)[method](url);
      assert.equal(unauthRes.status, 401, `${method} ${url} should be 401 for guest`);
      assert.equal(unauthRes.body.code, "AUTH_REQUIRED");

      // Customer → 403
      const forbiddenRes = await request(app)[method](url).set("Authorization", `Bearer ${customerToken}`);
      assert.equal(forbiddenRes.status, 403, `${method} ${url} should be 403 for customer`);
      assert.equal(forbiddenRes.body.code, "FORBIDDEN_ROLE");
    }
  });

  // ── GET /admin/inventory ─────────────────────────────────────────────────
  test("GET /admin/inventory returns 200 with paginated list", async () => {
    mock.method(inventoryRepository, "findAll", async () => [makeInventory()]);
    mock.method(inventoryRepository, "countAll", async () => 1);

    const res = await request(app)
      .get("/api/v1/admin/inventory")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.items);
    assert.ok(res.body.data.pagination);
    assert.equal(res.body.data.pagination.page, 1);
    assert.equal(res.body.data.items[0].sku, "DC-TS-BLK-M");
  });

  test("GET /admin/inventory with low_stock filter returns 200", async () => {
    mock.method(inventoryRepository, "findAll", async () => [makeInventory({ quantity_available: 3 })]);
    mock.method(inventoryRepository, "countAll", async () => 1);

    const res = await request(app)
      .get("/api/v1/admin/inventory?low_stock=true")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.items[0].quantity_available, 3);
  });

  test("GET /admin/inventory with invalid sort returns 400", async () => {
    const res = await request(app)
      .get("/api/v1/admin/inventory?sort=bad_sort")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 400);
  });

  // ── GET /admin/product-variants/:variantId/inventory ─────────────────────
  test("GET /admin/product-variants/:variantId/inventory returns 200 with inventory", async () => {
    mock.method(productVariantRepository, "findById", async (id) =>
      id === 101 ? { product_variant_id: 101, sku: "DC-TS-BLK-M" } : null,
    );
    mock.method(inventoryRepository, "findByVariantId", async () => makeInventory());

    const res = await request(app)
      .get("/api/v1/admin/product-variants/101/inventory")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.product_variant_id, 101);
    assert.equal(res.body.data.quantity_available, 8);
  });

  test("GET /admin/product-variants/:variantId/inventory returns 404 when not found", async () => {
    mock.method(productVariantRepository, "findById", async () => null);

    const res = await request(app)
      .get("/api/v1/admin/product-variants/999/inventory")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 404);
  });

  test("GET /admin/product-variants/invalid/inventory returns 400 for non-integer variantId", async () => {
    const res = await request(app)
      .get("/api/v1/admin/product-variants/abc/inventory")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 400);
  });

  // ── PATCH /admin/product-variants/:variantId/inventory ───────────────────
  test("PATCH /admin/product-variants/:variantId/inventory updates stock successfully", async () => {
    mock.method(productVariantRepository, "findById", async (id) =>
      id === 101 ? { product_variant_id: 101, sku: "DC-TS-BLK-M" } : null,
    );
    mock.method(inventoryRepository, "findByVariantId", async () => makeInventory());
    mock.method(inventoryRepository, "updateStock", async () =>
      makeInventory({ quantity_stock: 25, quantity_available: 23 }),
    );

    const res = await request(app)
      .patch("/api/v1/admin/product-variants/101/inventory")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity_stock: 25 });

    assert.equal(res.status, 200);
    assert.equal(res.body.code, "INVENTORY_UPDATED");
    assert.equal(res.body.data.quantity_stock, 25);
  });

  test("PATCH /admin/product-variants/:variantId/inventory rejects negative stock", async () => {
    const res = await request(app)
      .patch("/api/v1/admin/product-variants/101/inventory")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity_stock: -1 });

    assert.equal(res.status, 400);
  });

  test("PATCH /admin/product-variants/:variantId/inventory rejects quantity_reserved in body", async () => {
    const res = await request(app)
      .patch("/api/v1/admin/product-variants/101/inventory")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity_stock: 10, quantity_reserved: 5 });

    assert.equal(res.status, 400);
  });

  test("PATCH /admin/product-variants/:variantId/inventory returns 409 when stock < reserved", async () => {
    mock.method(productVariantRepository, "findById", async (id) =>
      id === 101 ? { product_variant_id: 101, sku: "DC-TS-BLK-M" } : null,
    );
    mock.method(inventoryRepository, "findByVariantId", async () =>
      makeInventory({ quantity_reserved: 6, quantity_stock: 10 }),
    );

    const res = await request(app)
      .patch("/api/v1/admin/product-variants/101/inventory")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity_stock: 4 });

    assert.equal(res.status, 409);
    assert.equal(res.body.code, "STOCK_BELOW_RESERVED");
  });

  test("PATCH /admin/product-variants/:variantId/inventory returns 404 for unknown variant", async () => {
    mock.method(productVariantRepository, "findById", async () => null);

    const res = await request(app)
      .patch("/api/v1/admin/product-variants/999/inventory")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity_stock: 10 });

    assert.equal(res.status, 404);
  });
});
