import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { paymentRepository } from "../../../src/repositories/payment.repository.js";

describe("payment repository", () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: mock.fn(async () => ({ rows: [], rowCount: 0 })),
      release: mock.fn(),
    };
    mock.method(pool, "connect", async () => mockClient);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe("createPayment and findByOrderId", () => {
    test("inserts payment record and returns created row", async () => {
      const paymentRow = {
        payment_id: 1,
        order_id: 100,
        payment_method: "cod",
        status_payment: "pending",
        amount_payment: 530000,
      };
      mockClient.query = mock.fn(async () => ({ rows: [paymentRow], rowCount: 1 }));

      const res = await paymentRepository.createPayment(paymentRow, mockClient);
      assert.ok(res);
      assert.equal(res.payment_id, 1);
      assert.equal(res.payment_method, "cod");
    });

    test("finds payment by order_id", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ payment_id: 1, order_id: 100 }], rowCount: 1 }));
      const res = await paymentRepository.findByOrderId(100, mockClient);
      assert.ok(res);
      assert.equal(res.payment_id, 1);
    });

    test("finds active payment by order_id", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ payment_id: 1, order_id: 100, status_payment: "pending" }], rowCount: 1 }));
      const res = await paymentRepository.findActivePaymentByOrderId(100, mockClient);
      assert.ok(res);
      assert.equal(res.payment_id, 1);
    });

    test("completeCodPayment and cancelCodPayment update payment status", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ payment_id: 1, status_payment: "paid" }], rowCount: 1 }));
      const resPaid = await paymentRepository.completeCodPayment(100, mockClient);
      assert.equal(resPaid.status_payment, "paid");

      mockClient.query = mock.fn(async () => ({ rows: [{ payment_id: 1, status_payment: "cancelled" }], rowCount: 1 }));
      const resCancelled = await paymentRepository.cancelCodPayment(100, mockClient);
      assert.equal(resCancelled.status_payment, "cancelled");
    });

    test("findByPayOSOrderCode finds payment by payos_order_code", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ payment_id: 1, payos_order_code: 123456 }], rowCount: 1 }));
      const res = await paymentRepository.findByPayOSOrderCode(123456, mockClient);
      assert.ok(res);
      assert.equal(res.payos_order_code, 123456);
    });

    test("markPayOSAsPaid and markPaymentExpired update payment status", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ payment_id: 1, status_payment: "paid", payos_transaction_reference: "REF1" }], rowCount: 1 }));
      const resPaid = await paymentRepository.markPayOSAsPaid({ paymentId: 1, reference: "REF1" }, mockClient);
      assert.equal(resPaid.status_payment, "paid");
      assert.equal(resPaid.payos_transaction_reference, "REF1");

      mockClient.query = mock.fn(async () => ({ rows: [{ payment_id: 1, status_payment: "expired" }], rowCount: 1 }));
      const resExpired = await paymentRepository.markPaymentExpired(1, mockClient);
      assert.equal(resExpired.status_payment, "expired");
    });

    test("guards PayOS transitions by the current payment state", async () => {
      const queries = [];
      mockClient.query = mock.fn(async (query) => {
        queries.push(query);
        return { rows: [], rowCount: 0 };
      });

      assert.equal(await paymentRepository.markPayOSAsPaid({ paymentId: 1, reference: "REF" }, mockClient), null);
      assert.equal(await paymentRepository.markPaymentExpired(1, mockClient), null);
      assert.match(queries[0], /status_payment IN \('pending', 'cancelled'\)/);
      assert.match(queries[1], /status_payment = 'pending'/);
    });

    test("cancels only the locked PayOS payment attempt", async () => {
      let queryText = "";
      let queryValues = [];
      mockClient.query = mock.fn(async (query, values) => {
        queryText = query;
        queryValues = values;
        return { rows: [{ payment_id: 7, status_payment: "cancelled" }], rowCount: 1 };
      });

      const result = await paymentRepository.cancelPendingPayOSPaymentById(7, mockClient);

      assert.equal(result.payment_id, 7);
      assert.deepEqual(queryValues, [7]);
      assert.match(queryText, /payment_id = \$1/);
      assert.match(queryText, /payment_method = 'payos'/);
      assert.match(queryText, /status_payment = 'pending'/);
    });
  });
});


