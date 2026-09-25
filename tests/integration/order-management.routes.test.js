import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { orderRepository } from "../../src/repositories/order.repository.js";
import { inventoryRepository } from "../../src/repositories/inventory.repository.js";
import { paymentRepository } from "../../src/repositories/payment.repository.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const validUserToken = createAccessToken(
  { user_id: "00000000-0000-4000-8000-000000000001", role: "customer", session_id: 1 },
  { secret, expiresIn: "1h" },
);

const sampleDetail = {
  order_id: 100,
  order_code: "ORD-001",
  user_id: "00000000-0000-4000-8000-000000000001",
  status_order: "pending",
  subtotal_order: 500000,
  discount_order: 0,
  shipping_fee_order: 30000,
  total_order: 530000,
  items: [
    {
      order_item_id: 1,
      product_variant_id: 101,
      name_product_order_item: "T-Shirt",
      quantity_order_item: 2,
      price_order_item: 250000,
      total_order_item: 500000,
    },
  ],
  address: { receiver_name_order_address: "User Name" },
  payment: { payment_method: "cod", status_payment: "pending" },
};

describe("customer & guest order management HTTP contract", () => {
  beforeEach(() => {
    mock.method(pool, "connect", async () => ({
      query: async () => ({ rows: [], rowCount: 1 }),
      release: () => {},
    }));
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      email: "user@example.com",
      role: "customer",
      status: "active",
    }));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // ── Authenticated User APIs ──────────────────────────────────────────────
  describe("Authenticated User Order APIs", () => {
    test("GET /api/v1/orders requires authentication", async () => {
      const res = await request(app).get("/api/v1/orders");
      assert.equal(res.status, 401);
    });

    test("GET /api/v1/orders returns list of user orders", async () => {
      mock.method(orderRepository, "findUserOrders", async () => [sampleDetail]);
      mock.method(orderRepository, "countUserOrders", async () => 1);

      const res = await request(app)
        .get("/api/v1/orders?page=1&limit=10")
        .set("Authorization", `Bearer ${validUserToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.items.length, 1);
      assert.equal(res.body.data.pagination.total, 1);
    });

    test("GET /api/v1/orders/:orderId returns detail for owned order", async () => {
      mock.method(orderRepository, "findUserOrderById", async (id, uid) => (id === 100 ? sampleDetail : null));

      const res = await request(app)
        .get("/api/v1/orders/100")
        .set("Authorization", `Bearer ${validUserToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.order_id, 100);
      assert.equal(res.body.data.items.length, 1);
    });

    test("GET /api/v1/orders/:orderId returns 404 for unowned or missing order", async () => {
      mock.method(orderRepository, "findUserOrderById", async () => null);

      const res = await request(app)
        .get("/api/v1/orders/999")
        .set("Authorization", `Bearer ${validUserToken}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.code, "ORDER_NOT_FOUND");
    });

    test("PATCH /api/v1/orders/:orderId/cancel cancels pending order", async () => {
      mock.method(orderRepository, "findUserOrderById", async () => sampleDetail);
      mock.method(orderRepository, "findOrderItems", async () => sampleDetail.items);
      mock.method(inventoryRepository, "releaseReservedStock", async () => ({}));
      mock.method(paymentRepository, "cancelPendingPaymentByOrderId", async () => ({}));
      mock.method(orderRepository, "updateOrderStatus", async (id, st) => ({ ...sampleDetail, status_order: st }));

      const res = await request(app)
        .patch("/api/v1/orders/100/cancel")
        .set("Authorization", `Bearer ${validUserToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status_order, "cancelled");
    });

    test("PATCH /api/v1/orders/:orderId/cancel rejects cancellation of shipping order with 409", async () => {
      mock.method(orderRepository, "findUserOrderById", async () => ({ ...sampleDetail, status_order: "shipping" }));

      const res = await request(app)
        .patch("/api/v1/orders/100/cancel")
        .set("Authorization", `Bearer ${validUserToken}`);

      assert.equal(res.status, 409);
      assert.equal(res.body.code, "ORDER_CANNOT_BE_CANCELLED");
    });
  });

  // ── Guest Order APIs ─────────────────────────────────────────────────────
  describe("Guest Order APIs", () => {
    test("POST /api/v1/orders/guest/lookup returns guest order when verification matches", async () => {
      mock.method(orderRepository, "findGuestOrder", async () => sampleDetail);

      const res = await request(app)
        .post("/api/v1/orders/guest/lookup")
        .send({
          order_code: "ORD-001",
          email: "guest@example.com",
          phone: "0901234567",
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.order_code, "ORD-001");
    });

    test("POST /api/v1/orders/guest/lookup returns 404 on mismatched verification", async () => {
      mock.method(orderRepository, "findGuestOrder", async () => null);

      const res = await request(app)
        .post("/api/v1/orders/guest/lookup")
        .send({
          order_code: "ORD-001",
          email: "wrong@example.com",
          phone: "0901234567",
        });

      assert.equal(res.status, 404);
      assert.equal(res.body.code, "ORDER_NOT_FOUND");
    });

    test("POST /api/v1/orders/guest/:orderCode/cancel cancels guest order", async () => {
      mock.method(orderRepository, "findGuestOrder", async () => sampleDetail);
      mock.method(orderRepository, "findOrderItems", async () => sampleDetail.items);
      mock.method(inventoryRepository, "releaseReservedStock", async () => ({}));
      mock.method(paymentRepository, "cancelPendingPaymentByOrderId", async () => ({}));
      mock.method(orderRepository, "updateOrderStatus", async (id, st) => ({ ...sampleDetail, status_order: st }));

      const res = await request(app)
        .post("/api/v1/orders/guest/ORD-001/cancel")
        .send({
          email: "guest@example.com",
          phone: "0901234567",
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status_order, "cancelled");
    });
  });
});
