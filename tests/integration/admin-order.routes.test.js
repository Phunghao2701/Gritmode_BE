import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { orderRepository } from "../../src/repositories/order.repository.js";
import { inventoryRepository } from "../../src/repositories/inventory.repository.js";
import { paymentRepository } from "../../src/repositories/payment.repository.js";
import { auditRepository } from "../../src/repositories/audit.repository.js";

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

const sampleDetail = {
  order_id: 100,
  order_code: "ORD-001",
  status_order: "pending",
  total_order: 500000,
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
  address: { receiver_name_order_address: "Nguyen Van A" },
  payment: { payment_method: "cod", status_payment: "pending" },
};

describe("admin order management HTTP contract", () => {
  beforeEach(() => {
    mock.method(pool, "connect", async () => ({
      query: async () => ({ rows: [], rowCount: 1 }),
      release: () => {},
    }));
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      email: "admin@example.com",
      role: id === "00000000-0000-4000-8000-000000000001" ? "admin" : "customer",
      status: "active",
    }));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // ── Authentication & Authorization ───────────────────────────────────────
  describe("Auth & Role Guards", () => {
    test("rejects unauthenticated request with 401", async () => {
      const res = await request(app).get("/api/v1/admin/orders");
      assert.equal(res.status, 401);
    });

    test("rejects customer role with 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/admin/orders")
        .set("Authorization", `Bearer ${customerToken}`);
      assert.equal(res.status, 403);
    });
  });

  // ── Order Listing & Detail ───────────────────────────────────────────────
  describe("Order Listing & Detail", () => {
    test("GET /api/v1/admin/orders returns paginated list with search and filters", async () => {
      mock.method(orderRepository, "findAdminOrders", async () => [sampleDetail]);
      mock.method(orderRepository, "countAdminOrders", async () => 1);

      const res = await request(app)
        .get("/api/v1/admin/orders?page=1&limit=20&search=ORD-001&status_order=pending")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.items.length, 1);
      assert.equal(res.body.data.pagination.total, 1);
    });

    test("GET /api/v1/admin/orders/:orderId returns complete order detail", async () => {
      mock.method(orderRepository, "findAdminOrderById", async (id) => (id === 100 ? sampleDetail : null));

      const res = await request(app)
        .get("/api/v1/admin/orders/100")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.order_id, 100);
      assert.equal(res.body.data.items.length, 1);
    });

    test("GET /api/v1/admin/orders/:orderId returns 404 for missing order", async () => {
      mock.method(orderRepository, "findAdminOrderById", async () => null);

      const res = await request(app)
        .get("/api/v1/admin/orders/999")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.code, "ORDER_NOT_FOUND");
    });
  });

  // ── Status Transitions ───────────────────────────────────────────────────
  describe("Order Status Lifecycle Transitions", () => {
    test("PATCH /confirm transitions pending to confirmed", async () => {
      mock.method(orderRepository, "lockOrderById", async () => sampleDetail);
      mock.method(orderRepository, "findAdminOrderById", async () => sampleDetail);
      mock.method(orderRepository, "updateOrderStatus", async (id, st) => ({ ...sampleDetail, status_order: st }));
      mock.method(auditRepository, "log", async () => ({}));

      const res = await request(app)
        .patch("/api/v1/admin/orders/100/confirm")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status_order, "confirmed");
    });

    test("PATCH /processing transitions confirmed to processing", async () => {
      const confirmed = { ...sampleDetail, status_order: "confirmed" };
      mock.method(orderRepository, "lockOrderById", async () => confirmed);
      mock.method(orderRepository, "findAdminOrderById", async () => confirmed);
      mock.method(orderRepository, "updateOrderStatus", async (id, st) => ({ ...confirmed, status_order: st }));
      mock.method(auditRepository, "log", async () => ({}));

      const res = await request(app)
        .patch("/api/v1/admin/orders/100/processing")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status_order, "processing");
    });

    test("PATCH /shipping transitions processing to shipping", async () => {
      const processing = { ...sampleDetail, status_order: "processing" };
      mock.method(orderRepository, "lockOrderById", async () => processing);
      mock.method(orderRepository, "findAdminOrderById", async () => processing);
      mock.method(orderRepository, "updateOrderStatus", async (id, st) => ({ ...processing, status_order: st }));
      mock.method(auditRepository, "log", async () => ({}));

      const res = await request(app)
        .patch("/api/v1/admin/orders/100/shipping")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status_order, "shipping");
    });

    test("PATCH /complete transitions shipping to completed and finalizes inventory & payment", async () => {
      const shipping = { ...sampleDetail, status_order: "shipping" };
      mock.method(orderRepository, "lockOrderById", async () => shipping);
      mock.method(orderRepository, "findAdminOrderById", async () => shipping);
      mock.method(orderRepository, "findOrderItems", async () => shipping.items);
      mock.method(inventoryRepository, "commitReservedStock", async () => ({}));
      mock.method(paymentRepository, "markCodAsPaid", async () => ({}));
      mock.method(orderRepository, "updateOrderStatus", async (id, st) => ({ ...shipping, status_order: st }));
      mock.method(auditRepository, "log", async () => ({}));

      const res = await request(app)
        .patch("/api/v1/admin/orders/100/complete")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status_order, "completed");
    });

    test("PATCH /cancel cancels order and releases inventory reservation", async () => {
      mock.method(orderRepository, "lockOrderById", async () => sampleDetail);
      mock.method(orderRepository, "findAdminOrderById", async () => sampleDetail);
      mock.method(orderRepository, "findOrderItems", async () => sampleDetail.items);
      mock.method(inventoryRepository, "releaseReservedStock", async () => ({}));
      mock.method(paymentRepository, "cancelPendingPaymentByOrderId", async () => ({}));
      mock.method(orderRepository, "updateOrderStatus", async (id, st) => ({ ...sampleDetail, status_order: st }));
      mock.method(auditRepository, "log", async () => ({}));

      const res = await request(app)
        .patch("/api/v1/admin/orders/100/cancel")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Customer requested cancellation" });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status_order, "cancelled");
    });

    test("PATCH invalid transition returns 409 Conflict", async () => {
      const shipping = { ...sampleDetail, status_order: "shipping" };
      mock.method(orderRepository, "lockOrderById", async () => shipping);
      mock.method(orderRepository, "findAdminOrderById", async () => shipping);

      const res = await request(app)
        .patch("/api/v1/admin/orders/100/confirm")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 409);
      assert.equal(res.body.code, "INVALID_ORDER_TRANSITION");
    });
  });
});
