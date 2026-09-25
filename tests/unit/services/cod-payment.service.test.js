import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createPaymentService } from "../../../src/services/payment.service.js";

describe("cod payment service", () => {
  const sampleOrder = {
    order_id: 100,
    total_order: 500000,
  };

  test("createCodPayment creates pending COD payment with order total", async () => {
    let createdPayload = null;
    const service = createPaymentService({
      payments: {
        findActivePaymentByOrderId: async () => null,
        createPayment: async (payload) => {
          createdPayload = payload;
          return { payment_id: 1, ...payload };
        },
      },
    });

    const result = await service.createCodPayment({ order: sampleOrder, total: 500000 });
    assert.ok(result);
    assert.equal(createdPayload.order_id, 100);
    assert.equal(createdPayload.payment_method, "cod");
    assert.equal(createdPayload.status_payment, "pending");
    assert.equal(createdPayload.amount_payment, 500000);
    assert.equal(createdPayload.payos_order_code, undefined);
    assert.equal(createdPayload.checkout_url, undefined);
  });

  test("createCodPayment returns existing active payment if already created", async () => {
    const existing = {
      payment_id: 1,
      order_id: 100,
      payment_method: "cod",
      status_payment: "pending",
      amount_payment: 500000,
    };

    const service = createPaymentService({
      payments: {
        findActivePaymentByOrderId: async () => existing,
        createPayment: async () => assert.fail("Should not create duplicate"),
      },
    });

    const result = await service.createCodPayment({ order: sampleOrder, total: 500000 });
    assert.equal(result.payment_id, 1);
  });

  test("completeCodPayment marks pending COD payment as paid with timestamp", async () => {
    const existing = {
      payment_id: 1,
      order_id: 100,
      payment_method: "cod",
      status_payment: "pending",
      amount_payment: 500000,
    };

    const service = createPaymentService({
      payments: {
        findByOrderId: async () => existing,
        completeCodPayment: async () => ({
          ...existing,
          status_payment: "paid",
          paid_at: new Date(),
        }),
      },
    });

    const result = await service.completeCodPayment(100, { total_order: 500000 });
    assert.ok(result);
    assert.equal(result.status_payment, "paid");
    assert.ok(result.paid_at);
  });

  test("completeCodPayment throws 404 if payment does not exist", async () => {
    const service = createPaymentService({
      payments: {
        findByOrderId: async () => null,
      },
    });

    await assert.rejects(
      () => service.completeCodPayment(999),
      (err) => err.statusCode === 404 && err.code === "PAYMENT_NOT_FOUND",
    );
  });

  test("completeCodPayment throws 409 if payment method is not COD or not pending", async () => {
    const payosPending = {
      payment_id: 1,
      order_id: 100,
      payment_method: "payos",
      status_payment: "pending",
    };

    const service = createPaymentService({
      payments: {
        findByOrderId: async () => payosPending,
      },
    });

    await assert.rejects(
      () => service.completeCodPayment(100),
      (err) => err.statusCode === 409 && err.code === "INVALID_PAYMENT_METHOD",
    );

    const codPaid = {
      payment_id: 1,
      order_id: 100,
      payment_method: "cod",
      status_payment: "paid",
    };

    const service2 = createPaymentService({
      payments: {
        findByOrderId: async () => codPaid,
      },
    });

    await assert.rejects(
      () => service2.completeCodPayment(100),
      (err) => err.statusCode === 409 && err.code === "INVALID_PAYMENT_STATUS",
    );
  });

  test("cancelCodPayment marks pending COD payment as cancelled", async () => {
    const existing = {
      payment_id: 1,
      order_id: 100,
      payment_method: "cod",
      status_payment: "pending",
    };

    const service = createPaymentService({
      payments: {
        findByOrderId: async () => existing,
        cancelCodPayment: async () => ({ ...existing, status_payment: "cancelled" }),
      },
    });

    const result = await service.cancelCodPayment(100);
    assert.ok(result);
    assert.equal(result.status_payment, "cancelled");
  });

  test("cancelCodPayment returns null if payment not found", async () => {
    const service = createPaymentService({
      payments: {
        findByOrderId: async () => null,
      },
    });

    const result = await service.cancelCodPayment(999);
    assert.equal(result, null);
  });

  test("completeCodPayment throws 409 on amount mismatch", async () => {
    const existing = {
      payment_id: 1,
      order_id: 100,
      payment_method: "cod",
      status_payment: "pending",
      amount_payment: 500000,
    };

    const service = createPaymentService({
      payments: {
        findByOrderId: async () => existing,
      },
    });

    await assert.rejects(
      () => service.completeCodPayment(100, { total_order: 600000 }),
      (err) => err.statusCode === 409 && err.code === "PAYMENT_AMOUNT_MISMATCH",
    );
  });

  test("getOrderPayment calls repository findByOrderId", async () => {
    const service = createPaymentService({
      payments: {
        findByOrderId: async (id) => ({ payment_id: id }),
      },
    });
    const res = await service.getOrderPayment(100);
    assert.equal(res.payment_id, 100);
  });

  test("createPayment routes to payos correctly", async () => {
    let createdData = null;
    const service = createPaymentService({
      payments: {
        createPayment: async (data) => {
          createdData = data;
          return data;
        },
      },
    });
    const res = await service.createPayment({ order: sampleOrder, paymentMethod: "payos", total: 500000 });
    assert.ok(res);
    assert.equal(createdData.payment_method, "payos");
    assert.ok(createdData.checkout_url);
  });

  test("cancelCodPayment returns payment without modifying if payment is not pending cod", async () => {
    const paidCod = { payment_id: 1, order_id: 100, payment_method: "cod", status_payment: "paid" };
    const service = createPaymentService({
      payments: {
        findByOrderId: async () => paidCod,
      },
    });
    const res = await service.cancelCodPayment(100);
    assert.equal(res.status_payment, "paid");
  });

  test("validateCodPaymentTransition validates correct transitions", () => {
    const service = createPaymentService();
    assert.equal(service.validateCodPaymentTransition("pending", "paid"), true);
    assert.equal(service.validateCodPaymentTransition("pending", "cancelled"), true);
    assert.equal(service.validateCodPaymentTransition("paid", "pending"), false);
    assert.equal(service.validateCodPaymentTransition("cancelled", "paid"), false);
    assert.equal(service.validateCodPaymentTransition("unknown", "paid"), false);
  });
});
