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

export const toClientOrder = (order) => {
  if (!order || typeof order !== "object") return order;
  return {
    ...order,
    payment: toClientPayment(order.payment),
  };
};
