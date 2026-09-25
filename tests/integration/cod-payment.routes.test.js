import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { cartRepository } from "../../src/repositories/cart.repository.js";
import { inventoryRepository } from "../../src/repositories/inventory.repository.js";
import { orderRepository } from "../../src/repositories/order.repository.js";
import { paymentRepository } from "../../src/repositories/payment.repository.js";
import { auditRepository } from "../../src/repositories/audit.repository.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const adminToken = createAccessToken(
  { user_id: "00000000-0000-4000-8000-000000000001", role: "admin", session_id: 1 },
  { secret, expiresIn: "1h" },
);

describe("COD payment integration flow", () => {
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

  test("Guest checkout with COD creates order and pending payment", async () => {
    mock.method(cartRepository, "findActiveByOwner", async () => ({ cart_id: 10, status_cart: "active" }));
    mock.method(cartRepository, "getDetailedItems", async () => [
      {
        cart_item_id: 1,
        product_variant_id: 101,
        name_product: "Logo T-Shirt",
        sku: "TS-BLK-M",
        variant: "Black / M",
        price: 500000,
        quantity: 2,
        quantity_available: 10,
      },
    ]);
    mock.method(inventoryRepository, "lockStockByVariantId", async () => ({ quantity_available: 10 }));
    mock.method(inventoryRepository, "reserveStock", async () => ({ quantity_stock: 10, quantity_reserved: 2, quantity_available: 8 }));
    mock.method(orderRepository, "createOrder", async (data) => ({ order_id: 101, ...data }));
    mock.method(orderRepository, "createOrderItems", async (items) => items);
    mock.method(orderRepository, "createOrderAddress", async (addr) => addr);
    mock.method(cartRepository, "updateStatus", async () => ({}));
    mock.method(paymentRepository, "findActivePaymentByOrderId", async () => null);
    mock.method(paymentRepository, "createPayment", async (data) => ({ payment_id: 1, ...data }));

    const res = await request(app)
      .post("/api/v1/orders")
      .send({
        guest_token: "guest_1234567890abcdef",
        email_order: "guest@example.com",
        phone_order: "0901234567",
        receiver_name_order_address: "Guest User",
        phone_order_address: "0901234567",
        address_line_order_address: "123 Nguyen Trai",
        ward_order_address: "Ben Thanh",
        district_order_address: "District 1",
        province_order_address: "HCM",
        payment_method: "cod",
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.order_id, 101);
    assert.equal(res.body.data.payment.payment_method, "cod");
    assert.equal(res.body.data.payment.status_payment, "pending");
    assert.equal(res.body.data.payment.checkout_url, undefined);
  });

  test("Admin complete COD order sets payment to paid with paid_at timestamp", async () => {
    const shippingOrder = {
      order_id: 100,
      order_code: "ORD-001",
      status_order: "shipping",
      total_order: 530000,
      items: [
        {
          order_item_id: 1,
          product_variant_id: 101,
          quantity_order_item: 2,
        },
      ],
      payment: {
        payment_id: 1,
        payment_method: "cod",
        status_payment: "pending",
        amount_payment: 530000,
      },
    };

    mock.method(orderRepository, "lockOrderById", async () => shippingOrder);
    mock.method(orderRepository, "findAdminOrderById", async () => shippingOrder);
    mock.method(orderRepository, "findOrderItems", async () => shippingOrder.items);
    mock.method(inventoryRepository, "commitReservedStock", async () => ({}));
    mock.method(paymentRepository, "findByOrderId", async () => shippingOrder.payment);
    mock.method(paymentRepository, "completeCodPayment", async () => ({
      ...shippingOrder.payment,
      status_payment: "paid",
      paid_at: new Date(),
    }));
    mock.method(paymentRepository, "markCodAsPaid", async () => ({
      ...shippingOrder.payment,
      status_payment: "paid",
      paid_at: new Date(),
    }));
    mock.method(orderRepository, "updateOrderStatus", async (id, st) => ({ ...shippingOrder, status_order: st }));
    mock.method(auditRepository, "log", async () => ({}));

    const res = await request(app)
      .patch("/api/v1/admin/orders/100/complete")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status_order, "completed");
  });
});
