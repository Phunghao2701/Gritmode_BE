import pool from "../config/database.js";

const runner = (client) => client || pool;

const paymentColumns = `
  payment_id,
  order_id,
  payment_method,
  status_payment,
  amount_payment,
  payos_order_code,
  payos_payment_link_id,
  checkout_url,
  qr_code,
  expired_at,
  paid_at,
  created_at,
  updated_at
`;

export const paymentRepository = {
  async createPayment(data, client) {
    const query = `
      INSERT INTO payment (
        order_id,
        payment_method,
        status_payment,
        amount_payment,
        payos_order_code,
        payos_payment_link_id,
        checkout_url,
        qr_code,
        expired_at,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING ${paymentColumns}
    `;
    const values = [
      data.order_id,
      data.payment_method,
      data.status_payment || "pending",
      data.amount_payment,
      data.payos_order_code || null,
      data.payos_payment_link_id || null,
      data.checkout_url || null,
      data.qr_code || null,
      data.expired_at || null,
    ];
    const { rows } = await runner(client).query(query, values);
    return rows[0];
  },

  async findByOrderId(orderId, client) {
    const { rows } = await runner(client).query(
      `SELECT ${paymentColumns} FROM payment WHERE order_id = $1 ORDER BY created_at DESC, payment_id DESC LIMIT 1`,
      [orderId],
    );
    return rows[0] || null;
  },

  async findActivePaymentByOrderId(orderId, client) {
    const { rows } = await runner(client).query(
      `SELECT ${paymentColumns} FROM payment WHERE order_id = $1 AND status_payment IN ('pending', 'paid') ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    return rows[0] || null;
  },

  async cancelPendingPaymentByOrderId(orderId, client) {
    const query = `
      UPDATE payment
      SET status_payment = 'cancelled', updated_at = NOW()
      WHERE order_id = $1 AND status_payment = 'pending'
      RETURNING ${paymentColumns}
    `;
    const { rows } = await runner(client).query(query, [orderId]);
    return rows[0] || null;
  },

  async markCodAsPaid(orderId, client) {
    const query = `
      UPDATE payment
      SET status_payment = 'paid', paid_at = NOW(), updated_at = NOW()
      WHERE order_id = $1 AND payment_method = 'cod' AND status_payment = 'pending'
      RETURNING ${paymentColumns}
    `;
    const { rows } = await runner(client).query(query, [orderId]);
    return rows[0] || null;
  },

  async completeCodPayment(orderId, client) {
    return this.markCodAsPaid(orderId, client);
  },

  async cancelCodPayment(orderId, client) {
    const query = `
      UPDATE payment
      SET status_payment = 'cancelled', updated_at = NOW()
      WHERE order_id = $1 AND payment_method = 'cod' AND status_payment = 'pending'
      RETURNING ${paymentColumns}
    `;
    const { rows } = await runner(client).query(query, [orderId]);
    return rows[0] || null;
  },

  async findByPayOSOrderCode(payosOrderCode, client) {
    const { rows } = await runner(client).query(
      `SELECT ${paymentColumns} FROM payment WHERE payos_order_code = $1`,
      [payosOrderCode],
    );
    return rows[0] || null;
  },

  async markPayOSAsPaid({ paymentId, reference }, client) {
    const query = `
      UPDATE payment
      SET status_payment = 'paid',
          paid_at = NOW(),
          payos_transaction_reference = COALESCE($2, payos_transaction_reference),
          updated_at = NOW()
      WHERE payment_id = $1
      RETURNING ${paymentColumns}
    `;
    const { rows } = await runner(client).query(query, [paymentId, reference || null]);
    return rows[0] || null;
  },

  async markPaymentExpired(paymentId, client) {
    const query = `
      UPDATE payment
      SET status_payment = 'expired', updated_at = NOW()
      WHERE payment_id = $1
      RETURNING ${paymentColumns}
    `;
    const { rows } = await runner(client).query(query, [paymentId]);
    return rows[0] || null;
  },
};




