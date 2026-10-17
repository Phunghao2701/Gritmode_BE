const CLIENT_PAYMENT_FIELDS = [
  "payment_method",
  "status_payment",
  "amount_payment",
  "checkout_url",
  "expired_at",
];

const toClientPaymentDisplay = (payment) => ({
  qr_code: payment.qr_code || null,
  bank_name: payment.payos_bank_name || null,
  account_number: payment.payos_account_number || null,
  account_name: payment.payos_account_name || null,
  amount: payment.amount_payment ?? null,
  transfer_description: payment.payos_transfer_description || null,
});

export const toClientPayment = (payment) => {
  if (!payment || typeof payment !== "object") return payment || null;

  const clientPayment = Object.fromEntries(
    CLIENT_PAYMENT_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(payment, field))
      .map((field) => [field, payment[field]]),
  );

  if (payment.payment_method === "payos") {
    clientPayment.payment_display = toClientPaymentDisplay(payment);
  }

  return clientPayment;
};

export const toClientRefundRequest = (request) => {
  if (!request || typeof request !== "object") return null;
  return {
    refund_request_id: request.refund_request_id ?? null,
    order_id: request.order_id ?? null,
    reason: request.reason || null,
    status_refund_request: request.status_refund_request || null,
    requested_at: request.requested_at || null,
    processed_at: request.processed_at || null,
  };
};

export const toClientOrder = (order) => {
  if (!order || typeof order !== "object") return order;
  return {
    ...order,
    payment: toClientPayment(order.payment),
    refund_request: toClientRefundRequest(order.refund_request),
  };
};
