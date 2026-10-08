import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentService } from "../../../src/services/payment.service.js";

test("polling accepts the PayOS GET response field id as paymentLinkId", async () => {
  const payment = {
    payment_id: 11,
    order_id: 7,
    payment_method: "payos",
    status_payment: "pending",
    amount_payment: 100000,
    payos_order_code: 123456,
    payos_payment_link_id: "link-123456",
  };
  const order = {
    order_id: 7,
    user_id: 42,
    status_order: "pending",
  };
  const paidPayment = { ...payment, status_payment: "paid" };
  const confirmedOrder = { ...order, status_order: "confirmed" };

  const service = createPaymentService({
    payos: {
      get: async () => ({
        id: "link-123456",
        orderCode: 123456,
        amountPaid: 100000,
        status: "PAID",
      }),
    },
    orders: {
      findById: async () => order,
      lockOrderById: async () => order,
      updateOrderStatus: async () => confirmedOrder,
    },
    payments: {
      findByOrderId: async () => payment,
      findByPayOSOrderCode: async () => payment,
      markPayOSAsPaid: async () => paidPayment,
    },
    notifications: {
      enqueuePaymentConfirmation: async () => undefined,
    },
    transaction: async (callback) => callback({}),
  });

  const result = await service.getOrderPaymentStatus(7, { user_id: 42 });

  assert.equal(result.status_payment, "paid");
  assert.equal(result.status_order, "confirmed");
});
