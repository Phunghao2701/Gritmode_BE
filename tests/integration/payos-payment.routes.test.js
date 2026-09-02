import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import axios from "axios";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { orderRepository } from "../../src/repositories/order.repository.js";
import { paymentRepository } from "../../src/repositories/payment.repository.js";
import { createPayOSSignature } from "../../src/utils/payos.js";

process.env.JWT_SECRET ||= "integration-test-secret";
process.env.PAYOS_CHECKSUM_KEY ||= "integration-test-checksum-key";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const validUserToken = createAccessToken(
  { user_id: "00000000-0000-4000-8000-000000000001", role: "customer", session_id: 1 },
  { secret, expiresIn: "1h" },
);

describe("payOS payment routes HTTP contract", () => {
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
    mock.method(axios, "post", async () => ({
      data: {
        code: "00",
        data: {
          checkoutUrl: "https://pay.payos.vn/100",
          qrCode: "QR100",
        },
      },
    }));
    mock.method(axios, "get", async () => ({
      data: {
        code: "00",
        data: {
          status: "PENDING",
          amountPaid: 0,
        },
      },
    }));
    mock.method(orderRepository, "updateOrderStatus", async () => ({
      order_id: 100,
      status_order: "confirmed",
    }));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test("POST /api/v1/payments/payos creates payOS payment link", async () => {
    const sampleOrder = {
      order_id: 100,
      user_id: "00000000-0000-4000-8000-000000000001",
      status_order: "pending",
      total_order: 500000,
    };

    mock.method(orderRepository, "findById", async () => sampleOrder);
    mock.method(paymentRepository, "findActivePaymentByOrderId", async () => null);
    mock.method(paymentRepository, "createPayment", async (data) => ({
      payment_id: 1,
      ...data,
    }));

    const res = await request(app)
      .post("/api/v1/payments/payos")
      .set("Authorization", `Bearer ${validUserToken}`)
      .send({ order_id: 100 });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.payment_method, "payos");
    assert.ok(res.body.data.checkout_url);
    assert.ok(res.body.data.qr_code);
  });

  test("POST /api/v1/payments/payos/webhook processes valid webhook successfully", async () => {
    const webhookData = {
      orderCode: 20260831001,
      amount: 500000,
      reference: "FT260831",
    };

    const signature = createPayOSSignature(webhookData, process.env.PAYOS_CHECKSUM_KEY);
    const existingPayment = {
      payment_id: 1,
      order_id: 100,
      payment_method: "payos",
      status_payment: "pending",
      amount_payment: 500000,
      payos_order_code: 20260831001,
    };

    mock.method(paymentRepository, "findByPayOSOrderCode", async () => existingPayment);
    mock.method(paymentRepository, "markPayOSAsPaid", async ({ reference }) => ({
      ...existingPayment,
      status_payment: "paid",
      payos_transaction_reference: reference,
      paid_at: new Date(),
    }));

    const res = await request(app)
      .post("/api/v1/payments/payos/webhook")
      .send({
        code: "00",
        desc: "success",
        success: true,
        data: webhookData,
        signature,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status_payment, "paid");
  });

  test("GET /api/v1/orders/:orderId/payment returns payment status", async () => {
    const sampleOrder = {
      order_id: 100,
      user_id: "00000000-0000-4000-8000-000000000001",
      status_order: "pending",
    };
    const samplePayment = {
      payment_id: 1,
      order_id: 100,
      payment_method: "payos",
      status_payment: "pending",
      amount_payment: 500000,
      checkout_url: "https://pay.payos.vn/1",
    };

    mock.method(orderRepository, "findById", async () => sampleOrder);
    mock.method(paymentRepository, "findByOrderId", async () => samplePayment);

    const res = await request(app)
      .get("/api/v1/orders/100/payment")
      .set("Authorization", `Bearer ${validUserToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status_payment, "pending");
  });

  test("POST /api/v1/orders/:orderId/payment/cancel cancels pending payment link", async () => {
    const sampleOrder = {
      order_id: 100,
      user_id: "00000000-0000-4000-8000-000000000001",
      status_order: "pending",
    };
    const samplePayment = {
      payment_id: 1,
      order_id: 100,
      payment_method: "payos",
      status_payment: "pending",
      expired_at: new Date(Date.now() + 10 * 60 * 1000),
    };

    mock.method(orderRepository, "findById", async () => sampleOrder);
    mock.method(paymentRepository, "findByOrderId", async () => samplePayment);
    mock.method(paymentRepository, "cancelPendingPaymentByOrderId", async () => ({
      ...samplePayment,
      status_payment: "cancelled",
    }));

    const res = await request(app)
      .post("/api/v1/orders/100/payment/cancel")
      .set("Authorization", `Bearer ${validUserToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status_payment, "cancelled");
  });
});
