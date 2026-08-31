import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createPaymentService } from "../../../src/services/payment.service.js";
import { createPayOSSignature } from "../../../src/utils/payos.js";

const checksumKey = "test_checksum_key_12345";

describe("payOS payment service", () => {
  const sampleOrder = {
    order_id: 100,
    user_id: "user-1",
    status_order: "pending",
    total_order: 500000,
  };

  test("createPayOSPayment creates pending payOS payment with 15m expiration and QR", async () => {
    let createdPayload = null;
    const service = createPaymentService({
      payments: {
        findActivePaymentByOrderId: async () => null,
        createPayment: async (payload) => {
          createdPayload = payload;
          return { payment_id: 1, ...payload };
        },
      },
      orders: {
        findById: async () => sampleOrder,
      },
    });

    const result = await service.createPayOSPayment({
      orderId: 100,
      user: { user_id: "user-1" },
    });

    assert.ok(result);
    assert.equal(createdPayload.payment_method, "payos");
    assert.equal(createdPayload.status_payment, "pending");
    assert.equal(createdPayload.amount_payment, 500000);
    assert.ok(createdPayload.payos_order_code);
    assert.ok(createdPayload.checkout_url);
    assert.ok(createdPayload.qr_code);
    assert.ok(createdPayload.expired_at);
  });

  test("createPayOSPayment returns existing active payment if still valid", async () => {
    const validActive = {
      payment_id: 1,
      order_id: 100,
      payment_method: "payos",
      status_payment: "pending",
      amount_payment: 500000,
      payos_order_code: 999111,
      checkout_url: "https://pay.payos.vn/1",
      qr_code: "QR1",
      expired_at: new Date(Date.now() + 10 * 60 * 1000),
    };

    const service = createPaymentService({
      payments: {
        findActivePaymentByOrderId: async () => validActive,
        createPayment: async () => assert.fail("Should not create duplicate"),
      },
      orders: {
        findById: async () => sampleOrder,
      },
    });

    const result = await service.createPayOSPayment({
      orderId: 100,
      user: { user_id: "user-1" },
    });

    assert.equal(result.payment_id, 1);
    assert.equal(result.payos_order_code, 999111);
  });

  test("createPayOSPayment creates new attempt if existing payment is expired", async () => {
    const expiredActive = {
      payment_id: 1,
      order_id: 100,
      payment_method: "payos",
      status_payment: "pending",
      amount_payment: 500000,
      expired_at: new Date(Date.now() - 1000),
    };

    let markedExpired = false;
    let createdPayload = null;

    const service = createPaymentService({
      payments: {
        findActivePaymentByOrderId: async () => expiredActive,
        markPaymentExpired: async () => { markedExpired = true; },
        createPayment: async (payload) => {
          createdPayload = payload;
          return { payment_id: 2, ...payload };
        },
      },
      orders: {
        findById: async () => sampleOrder,
      },
    });

    const result = await service.createPayOSPayment({
      orderId: 100,
      user: { user_id: "user-1" },
    });

    assert.equal(result.payment_id, 2);
    assert.equal(markedExpired, true);
    assert.ok(createdPayload);
  });

  test("createPayOSPayment throws 409 if order is not pending or already paid", async () => {
    const service1 = createPaymentService({
      orders: {
        findById: async () => ({ ...sampleOrder, status_order: "completed" }),
      },
    });

    await assert.rejects(
      () => service1.createPayOSPayment({ orderId: 100, user: { user_id: "user-1" } }),
      (err) => err.statusCode === 409 && err.code === "ORDER_CANNOT_BE_PAID",
    );

    const service2 = createPaymentService({
      orders: {
        findById: async () => sampleOrder,
      },
      payments: {
        findActivePaymentByOrderId: async () => ({
          payment_id: 1,
          status_payment: "paid",
        }),
      },
    });

    await assert.rejects(
      () => service2.createPayOSPayment({ orderId: 100, user: { user_id: "user-1" } }),
      (err) => err.statusCode === 409 && err.code === "PAYMENT_ALREADY_PAID",
    );
  });

  test("handlePayOSWebhook verifies signature and marks payment as paid", async () => {
    const webhookData = {
      orderCode: 20260831001,
      amount: 500000,
      description: "DH100",
      accountNumber: "123456789",
      reference: "FT260831",
      transactionDateTime: "2026-08-31 18:00:00",
      currency: "VND",
      paymentLinkId: "link_123",
      code: "00",
      desc: "success",
    };

    const signature = createPayOSSignature(webhookData, checksumKey);
    const webhookPayload = {
      code: "00",
      desc: "success",
      success: true,
      data: webhookData,
      signature,
    };

    const existingPayment = {
      payment_id: 1,
      order_id: 100,
      payment_method: "payos",
      status_payment: "pending",
      amount_payment: 500000,
      payos_order_code: 20260831001,
    };

    let updatedReference = null;
    const service = createPaymentService({
      payments: {
        findByPayOSOrderCode: async () => existingPayment,
        markPayOSAsPaid: async ({ reference }) => {
          updatedReference = reference;
          return {
            ...existingPayment,
            status_payment: "paid",
            payos_transaction_reference: reference,
            paid_at: new Date(),
          };
        },
      },
      checksumKey,
    });

    const result = await service.handlePayOSWebhook(webhookPayload);
    assert.ok(result);
    assert.equal(result.status_payment, "paid");
    assert.equal(updatedReference, "FT260831");
  });

  test("handlePayOSWebhook is idempotent for already paid payment", async () => {
    const webhookData = {
      orderCode: 20260831001,
      amount: 500000,
      description: "DH100",
      accountNumber: "123456789",
      reference: "FT260831",
      transactionDateTime: "2026-08-31 18:00:00",
      currency: "VND",
      paymentLinkId: "link_123",
      code: "00",
      desc: "success",
    };

    const signature = createPayOSSignature(webhookData, checksumKey);
    const webhookPayload = {
      code: "00",
      desc: "success",
      success: true,
      data: webhookData,
      signature,
    };

    const alreadyPaidPayment = {
      payment_id: 1,
      order_id: 100,
      payment_method: "payos",
      status_payment: "paid",
      amount_payment: 500000,
      payos_order_code: 20260831001,
    };

    const service = createPaymentService({
      payments: {
        findByPayOSOrderCode: async () => alreadyPaidPayment,
        markPayOSAsPaid: async () => assert.fail("Should not mark paid again"),
      },
      checksumKey,
    });

    const result = await service.handlePayOSWebhook(webhookPayload);
    assert.equal(result.status_payment, "paid");
  });

  test("handlePayOSWebhook throws 400 on invalid signature or amount mismatch", async () => {
    const service = createPaymentService({ checksumKey });

    await assert.rejects(
      () => service.handlePayOSWebhook({ data: { orderCode: 1 }, signature: "invalid_sig" }),
      (err) => err.statusCode === 400 && err.code === "INVALID_WEBHOOK_SIGNATURE",
    );

    const webhookData = {
      orderCode: 20260831001,
      amount: 100000,
    };
    const signature = createPayOSSignature(webhookData, checksumKey);
    const service2 = createPaymentService({
      payments: {
        findByPayOSOrderCode: async () => ({
          payment_id: 1,
          amount_payment: 500000,
          status_payment: "pending",
        }),
      },
      checksumKey,
    });

    await assert.rejects(
      () => service2.handlePayOSWebhook({ data: webhookData, signature }),
      (err) => err.statusCode === 400 && err.code === "AMOUNT_MISMATCH",
    );
  });

  test("cancelPayOSPaymentLink cancels pending payment link", async () => {
    const pendingPayment = {
      payment_id: 1,
      order_id: 100,
      payment_method: "payos",
      status_payment: "pending",
      expired_at: new Date(Date.now() + 10 * 60 * 1000),
    };

    const service = createPaymentService({
      payments: {
        findByOrderId: async () => pendingPayment,
        cancelPendingPaymentByOrderId: async () => ({ ...pendingPayment, status_payment: "cancelled" }),
      },
      orders: {
        findById: async () => sampleOrder,
      },
    });

    const result = await service.cancelPayOSPaymentLink(100, { user_id: "user-1" });
    assert.ok(result);
    assert.equal(result.status_payment, "cancelled");
  });

  test("createPayOSPayment throws 404 if order not found or unauthorized", async () => {
    const service = createPaymentService({
      orders: { findById: async () => null },
    });
    await assert.rejects(
      () => service.createPayOSPayment({ orderId: 999 }),
      (err) => err.statusCode === 404,
    );

    const service2 = createPaymentService({
      orders: { findById: async () => ({ order_id: 100, user_id: "user-1", status_order: "pending" }) },
    });
    await assert.rejects(
      () => service2.createPayOSPayment({ orderId: 100, user: { user_id: "other-user" } }),
      (err) => err.statusCode === 404,
    );
  });

  test("handlePayOSWebhook throws 404 for unknown payos orderCode", async () => {
    const webhookData = { orderCode: 999999, amount: 500000 };
    const signature = createPayOSSignature(webhookData, checksumKey);
    const service = createPaymentService({
      payments: { findByPayOSOrderCode: async () => null },
      checksumKey,
    });
    await assert.rejects(
      () => service.handlePayOSWebhook({ data: webhookData, signature }),
      (err) => err.statusCode === 404 && err.code === "PAYMENT_NOT_FOUND",
    );
  });

  test("getOrderPaymentStatus validates order, ownership and payment existence", async () => {
    const service = createPaymentService({
      orders: { findById: async (id) => (id === 100 ? sampleOrder : null) },
      payments: { findByOrderId: async (id) => (id === 100 ? { payment_id: 1 } : null) },
    });

    await assert.rejects(() => service.getOrderPaymentStatus(999), (err) => err.statusCode === 404);
    await assert.rejects(
      () => service.getOrderPaymentStatus(100, { user_id: "other" }),
      (err) => err.statusCode === 404,
    );

    const serviceNoPay = createPaymentService({
      orders: { findById: async () => sampleOrder },
      payments: { findByOrderId: async () => null },
    });
    await assert.rejects(
      () => serviceNoPay.getOrderPaymentStatus(100, { user_id: "user-1" }),
      (err) => err.statusCode === 404 && err.code === "PAYMENT_NOT_FOUND",
    );

    const res = await service.getOrderPaymentStatus(100, { user_id: "user-1" });
    assert.equal(res.payment_id, 1);
  });

  test("cancelPayOSPaymentLink validates order, ownership, payment existence, and state", async () => {
    const service = createPaymentService({
      orders: { findById: async (id) => (id === 100 ? sampleOrder : null) },
      payments: { findByOrderId: async () => null },
    });

    await assert.rejects(() => service.cancelPayOSPaymentLink(999), (err) => err.statusCode === 404);
    await assert.rejects(
      () => service.cancelPayOSPaymentLink(100, { user_id: "other" }),
      (err) => err.statusCode === 404,
    );
    await assert.rejects(
      () => service.cancelPayOSPaymentLink(100, { user_id: "user-1" }),
      (err) => err.statusCode === 404 && err.code === "PAYMENT_NOT_FOUND",
    );

    const serviceInvalidState = createPaymentService({
      orders: { findById: async () => sampleOrder },
      payments: {
        findByOrderId: async () => ({
          payment_id: 1,
          payment_method: "payos",
          status_payment: "paid",
        }),
      },
    });
    await assert.rejects(
      () => serviceInvalidState.cancelPayOSPaymentLink(100, { user_id: "user-1" }),
      (err) => err.statusCode === 409 && err.code === "CANNOT_CANCEL_PAYMENT",
    );
  });
});

