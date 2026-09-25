import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { voucherRepository } from "../../src/repositories/voucher.repository.js";
import { cartRepository } from "../../src/repositories/cart.repository.js";

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

const makeVoucher = (overrides = {}) => ({
  voucher_id: 1,
  code_voucher: "SUMMER10",
  name_voucher: "Summer 10%",
  discount_type: "percentage",
  discount_value: 10,
  minimum_order_amount: 500000,
  maximum_discount_amount: 100000,
  usage_limit: 100,
  usage_count: 5,
  start_at: null,
  end_at: null,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe("voucher HTTP contract", () => {
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

  // ── Public Validate Endpoint ─────────────────────────────────────────────
  describe("POST /api/v1/vouchers/validate", () => {
    test("guest can validate voucher with X-Guest-Token", async () => {
      mock.method(cartRepository, "findActiveByOwner", async () => ({ cart_id: 10, status_cart: "active" }));
      mock.method(cartRepository, "getDetailedItems", async () => [
        { cart_item_id: 1, quantity: 2, price: 500000, quantity_available: 10 },
      ]);
      mock.method(voucherRepository, "findByCode", async (code) =>
        code === "SUMMER10" ? makeVoucher() : null,
      );

      const guestToken = "guest_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const res = await request(app)
        .post("/api/v1/vouchers/validate")
        .set("X-Guest-Token", guestToken)
        .send({ code_voucher: "SUMMER10" });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.code_voucher, "SUMMER10");
      assert.equal(res.body.data.discount_amount, 100000);
    });

    test("logged-in customer can validate voucher with Bearer token", async () => {
      mock.method(cartRepository, "findActiveByOwner", async () => ({ cart_id: 10, status_cart: "active" }));
      mock.method(cartRepository, "getDetailedItems", async () => [
        { cart_item_id: 1, quantity: 2, price: 500000, quantity_available: 10 },
      ]);
      mock.method(voucherRepository, "findByCode", async (code) =>
        code === "SUMMER10" ? makeVoucher() : null,
      );

      const res = await request(app)
        .post("/api/v1/vouchers/validate")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ code_voucher: "summer10" });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.code_voucher, "SUMMER10");
      assert.equal(res.body.data.discount_amount, 100000);
    });

    test("returns 400 when code_voucher is empty", async () => {
      const res = await request(app)
        .post("/api/v1/vouchers/validate")
        .send({});

      assert.equal(res.status, 400);
    });

    test("returns 404 when voucher not found", async () => {
      mock.method(cartRepository, "findActiveByOwner", async () => ({ cart_id: 10, status_cart: "active" }));
      mock.method(cartRepository, "getDetailedItems", async () => [
        { cart_item_id: 1, quantity: 2, price: 500000, quantity_available: 10 },
      ]);
      mock.method(voucherRepository, "findByCode", async () => null);

      const res = await request(app)
        .post("/api/v1/vouchers/validate")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ code_voucher: "NONEXISTENT" });

      assert.equal(res.status, 404);
      assert.equal(res.body.code, "VOUCHER_NOT_FOUND");
    });
  });

  // ── Admin Endpoints Auth Guards ──────────────────────────────────────────
  describe("Admin voucher endpoints auth & role guards", () => {
    const endpoints = [
      ["get", "/api/v1/admin/vouchers"],
      ["get", "/api/v1/admin/vouchers/1"],
      ["post", "/api/v1/admin/vouchers"],
      ["patch", "/api/v1/admin/vouchers/1"],
      ["patch", "/api/v1/admin/vouchers/1/status"],
      ["delete", "/api/v1/admin/vouchers/1"],
    ];

    for (const [method, url] of endpoints) {
      test(`${method.toUpperCase()} ${url} rejects unauthenticated and non-admin`, async () => {
        // Guest
        const unauthRes = await request(app)[method](url);
        assert.equal(unauthRes.status, 401);
        assert.equal(unauthRes.body.code, "AUTH_REQUIRED");

        // Customer
        const forbiddenRes = await request(app)[method](url).set("Authorization", `Bearer ${customerToken}`);
        assert.equal(forbiddenRes.status, 403);
        assert.equal(forbiddenRes.body.code, "FORBIDDEN_ROLE");
      });
    }
  });

  // ── Admin CRUD Endpoints ─────────────────────────────────────────────────
  describe("Admin voucher CRUD", () => {
    test("GET /api/v1/admin/vouchers returns 200 with list & pagination", async () => {
      mock.method(voucherRepository, "findAll", async () => [makeVoucher()]);
      mock.method(voucherRepository, "countAll", async () => 1);

      const res = await request(app)
        .get("/api/v1/admin/vouchers")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.items);
      assert.equal(res.body.data.items[0].code_voucher, "SUMMER10");
      assert.equal(res.body.data.pagination.total, 1);
    });

    test("GET /api/v1/admin/vouchers/:voucherId returns 200 with voucher detail", async () => {
      mock.method(voucherRepository, "findById", async (id) => (id === 1 ? makeVoucher() : null));

      const res = await request(app)
        .get("/api/v1/admin/vouchers/1")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.voucher_id, 1);
      assert.equal(res.body.data.status_voucher, "active");
    });

    test("POST /api/v1/admin/vouchers creates voucher successfully", async () => {
      mock.method(voucherRepository, "findByCode", async () => null);
      mock.method(voucherRepository, "create", async (data) => ({ voucher_id: 10, ...data, usage_count: 0 }));

      const res = await request(app)
        .post("/api/v1/admin/vouchers")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code_voucher: "DISCOUNT50",
          name_voucher: "Discount 50%",
          discount_type: "percentage",
          discount_value: 50,
          minimum_order_amount: 200000,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.code, "VOUCHER_CREATED");
      assert.equal(res.body.data.code_voucher, "DISCOUNT50");
    });

    test("PATCH /api/v1/admin/vouchers/:voucherId updates voucher", async () => {
      mock.method(voucherRepository, "findById", async (id) => (id === 1 ? makeVoucher() : null));
      mock.method(voucherRepository, "update", async (id, data) => ({ ...makeVoucher(), ...data }));

      const res = await request(app)
        .patch("/api/v1/admin/vouchers/1")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name_voucher: "Updated Name" });

      assert.equal(res.status, 200);
      assert.equal(res.body.code, "VOUCHER_UPDATED");
      assert.equal(res.body.data.name_voucher, "Updated Name");
    });

    test("PATCH /api/v1/admin/vouchers/:voucherId/status toggles status", async () => {
      mock.method(voucherRepository, "findById", async (id) => (id === 1 ? makeVoucher() : null));
      mock.method(voucherRepository, "updateStatus", async (id, isActive) => makeVoucher({ is_active: isActive }));

      const res = await request(app)
        .patch("/api/v1/admin/vouchers/1/status")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ is_active: false });

      assert.equal(res.status, 200);
      assert.equal(res.body.code, "VOUCHER_STATUS_UPDATED");
      assert.equal(res.body.data.is_active, false);
    });

    test("DELETE /api/v1/admin/vouchers/:voucherId deletes unused voucher", async () => {
      mock.method(voucherRepository, "findById", async (id) => (id === 1 ? makeVoucher() : null));
      mock.method(voucherRepository, "hasOrderReferences", async () => false);
      mock.method(voucherRepository, "delete", async () => true);

      const res = await request(app)
        .delete("/api/v1/admin/vouchers/1")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.code, "VOUCHER_DELETED");
    });
  });
});
