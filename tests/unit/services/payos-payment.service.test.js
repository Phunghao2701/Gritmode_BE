import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createPaymentService } from "../../../src/services/payment.service.js";
import { createPayOSSignature } from "../../../src/utils/payos.js";

const checksumKey = "test_checksum_key_12345";
const payos = {
  create: async ({ orderCode }) => ({
    checkoutUrl: `https://pay.payos.vn/${orderCode}`,
    qrCode: `QR-${orderCode}`,
    paymentLinkId: `link_${orderCode}`,
  }),
  get: async () => null,
};

describe("payOS payment service", () => {
  const sampleOrder = {
    order_id: 100,
    order_code: "ORD-100",
    user_id: "user-1",
    status_order: "pending",
    total_order: 500000,
  };
  const transaction = async (callback) => callback({});

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
        lockOrderById: async () => sampleOrder,
      },
      payos,
      transaction,
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
        lockOrderById: async () => sampleOrder,
      },
      payos,
      transaction,
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
        lockOrderById: async () => sampleOrder,
      },
      payos,
      transaction,
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
    let enqueuedOrder = null;
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
      orders: {
        lockOrderById: async () => sampleOrder,
        updateOrderStatus: async () => ({ ...sampleOrder, status_order: "confirmed" }),
        findAdminOrderById: async () => ({ order_id: 100, order_code: "ORD-100", email_order: "buyer@example.com", items: [], address: {} }),
      },
      notifications: { enqueuePaymentConfirmation: async ({ order }) => { enqueuedOrder = order; } },
      checksumKey,
      transaction,
    });

    const result = await service.handlePayOSWebhook(webhookPayload);
    assert.ok(result);
    assert.equal(result.status_payment, "paid");
    assert.equal(updatedReference, "FT260831");
    assert.equal(enqueuedOrder.order_code, "ORD-100");
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
      code: "00",
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
      () => service2.handlePayOSWebhook({ code: "00", success: true, data: webhookData, signature }),
      (err) => err.statusCode === 400 && err.code === "AMOUNT_MISMATCH",
    );
  });

  test("handlePayOSWebhook rejects signed non-success provider results without mutation", async () => {
    let transactionCalled = false;
    const webhookData = { orderCode: 20260831002, amount: 500000, code: "01" };
    const signature = createPayOSSignature(webhookData, checksumKey);
    const service = createPaymentService({
      payments: {
        findByPayOSOrderCode: async () => ({
          payment_id: 2,
          order_id: 100,
          payos_order_code: webhookData.orderCode,
          amount_payment: 500000,
          status_payment: "pending",
        }),
      },
      checksumKey,
      transaction: async () => {
        transactionCalled = true;
        throw new Error("transaction must not run");
      },
    });

    await assert.rejects(
      () => service.handlePayOSWebhook({ code: "01", success: false, data: webhookData, signature }),
      (err) => err.statusCode === 400 && err.code === "INVALID_WEBHOOK_STATUS",
    );
    assert.equal(transactionCalled, false);
  });

  test("late settlement marks cancelled payment paid and creates review only", async () => {
    const webhookData = {
      orderCode: 20260831003,
      amount: 500000,
      paymentLinkId: "link_3",
      reference: "FT-LATE-3",
      code: "00",
    };
    const signature = createPayOSSignature(webhookData, checksumKey);
    const cancelledPayment = {
      payment_id: 3,
      order_id: 100,
      payment_method: "payos",
      status_payment: "cancelled",
      amount_payment: 500000,
      payos_order_code: webhookData.orderCode,
      payos_payment_link_id: "link_3",
    };
    let confirmationCalls = 0;
    let reviewPayload = null;
    let orderUpdateCalls = 0;
    const service = createPaymentService({
      payments: {
        findByPayOSOrderCode: async () => cancelledPayment,
        markPayOSAsPaid: async () => ({ ...cancelledPayment, status_payment: "paid" }),
      },
      orders: {
        lockOrderById: async () => ({ ...sampleOrder, status_order: "cancelled" }),
        updateOrderStatus: async () => { orderUpdateCalls += 1; },
      },
      notifications: {
        enqueuePaymentConfirmation: async () => { confirmationCalls += 1; },
        enqueuePayOSLatePaymentReview: async (payload) => { reviewPayload = payload; },
      },
      checksumKey,
      transaction,
    });

    const result = await service.handlePayOSWebhook({ code: "00", success: true, data: webhookData, signature });
    assert.equal(result.review_required, true);
    assert.equal(result.status_payment, "paid");
    assert.equal(orderUpdateCalls, 0);
    assert.equal(confirmationCalls, 0);
    assert.equal(reviewPayload.payment.payment_id, 3);
  });

  test("terminal payment states cannot be promoted by a valid webhook", async () => {
    for (const status of ["failed", "expired", "processing", "refunded"]) {
      const webhookData = { orderCode: 20260831010 + status.length, amount: 500000, code: "00" };
      const signature = createPayOSSignature(webhookData, checksumKey);
      let markCalls = 0;
      const service = createPaymentService({
        payments: {
          findByPayOSOrderCode: async () => ({
            payment_id: 10,
            order_id: 100,
            payment_method: "payos",
            payos_order_code: webhookData.orderCode,
            amount_payment: 500000,
            status_payment: status,
          }),
          markPayOSAsPaid: async () => { markCalls += 1; },
        },
        orders: { lockOrderById: async () => sampleOrder },
        checksumKey,
        transaction,
      });

      await assert.rejects(
        () => service.handlePayOSWebhook({ code: "00", success: true, data: webhookData, signature }),
        (err) => err.statusCode === 409 && err.code === "PAYMENT_CANNOT_BE_SETTLED",
      );
      assert.equal(markCalls, 0);
    }
  });

  test("polling uses the shared settlement path with exact amount and identity checks", async () => {
    const payment = {
      payment_id: 11,
      order_id: 100,
      payment_method: "payos",
      status_payment: "pending",
      amount_payment: 500000,
      payos_order_code: 20260831011,
      payos_payment_link_id: "link_11",
    };
    let updatedOrder = 0;
    const service = createPaymentService({
      orders: {
        findById: async () => sampleOrder,
        lockOrderById: async () => sampleOrder,
        updateOrderStatus: async () => {
          updatedOrder += 1;
          return { ...sampleOrder, status_order: "confirmed" };
        },
      },
      payments: {
        findByOrderId: async () => payment,
        findByPayOSOrderCode: async () => payment,
        markPayOSAsPaid: async () => ({ ...payment, status_payment: "paid" }),
      },
      payos: {
        get: async () => ({
          status: "PAID",
          amountPaid: 500000,
          orderCode: 20260831011,
          paymentLinkId: "link_11",
          id: "provider-11",
        }),
      },
      notifications: { enqueuePaymentConfirmation: async () => {} },
      transaction,
    });

    const result = await service.getOrderPaymentStatus(100, { user_id: "user-1" });
    assert.equal(result.status_payment, "paid");
    assert.equal(updatedOrder, 1);
  });

  test("polling rejects a PAID response without both PayOS identity fields", async () => {
    const payment = {
      payment_id: 1,
      order_id: 100,
      payment_method: "payos",
      status_payment: "pending",
      amount_payment: 500000,
      payos_order_code: 20260831011,
      payos_payment_link_id: "link_11",
    };

    const service = createPaymentService({
      orders: { findById: async () => sampleOrder },
      payments: { findByOrderId: async () => payment },
      payos: {
        get: async () => ({ status: "PAID", amountPaid: 500000 }),
      },
      transaction,
    });

    await assert.rejects(
      () => service.getOrderPaymentStatus(100, { user_id: "user-1" }),
      (err) => err.code === "PAYOS_IDENTITY_MISMATCH" && err.statusCode === 400,
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
        cancelPendingPayOSPaymentById: async () => ({ ...pendingPayment, status_payment: "cancelled" }),
      },
      orders: {
        findById: async () => sampleOrder,
        lockOrderById: async () => sampleOrder,
      },
      transaction,
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
