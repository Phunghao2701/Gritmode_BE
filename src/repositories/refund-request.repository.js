import pool from "../config/database.js";

const runner = (client) => client || pool;

const refundRequestColumns = `
  refund_request_id,
  order_id,
  payment_id,
  requester_user_id,
  requester_type,
  reason,
  status_refund_request,
  provider_reference,
  admin_note,
  processed_by,
  requested_at,
  processed_at,
  created_at,
  updated_at
`;

const qualifiedRefundRequestColumns = refundRequestColumns
  .split(",")
  .map((column) => column.trim())
  .filter(Boolean)
  .map((column) => `rr.${column}`)
  .join(",\n          ");

export const refundRequestRepository = {
  async findById(refundRequestId, client) {
    const { rows } = await runner(client).query(
      `SELECT ${refundRequestColumns} FROM refund_request WHERE refund_request_id = $1`,
      [refundRequestId],
    );
    return rows[0] || null;
  },

  async lockById(refundRequestId, client) {
    const { rows } = await runner(client).query(
      `SELECT ${refundRequestColumns} FROM refund_request WHERE refund_request_id = $1 FOR UPDATE`,
      [refundRequestId],
    );
    return rows[0] || null;
  },

  async findByOrderId(orderId, client) {
    const { rows } = await runner(client).query(
      `SELECT ${refundRequestColumns} FROM refund_request WHERE order_id = $1`,
      [orderId],
    );
    return rows[0] || null;
  },

  async create({ orderId, paymentId, requesterUserId = null, requesterType = "customer", reason = null }, client) {
    const { rows } = await runner(client).query(
      `
        INSERT INTO refund_request
          (order_id, payment_id, requester_user_id, requester_type, reason)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING ${refundRequestColumns}
      `,
      [orderId, paymentId, requesterUserId, requesterType, reason || null],
    );
    return rows[0] || null;
  },

  async reopen(refundRequestId, { requesterUserId = null, requesterType = "customer", reason = null } = {}, client) {
    const { rows } = await runner(client).query(
      `
        UPDATE refund_request
        SET requester_user_id = $2,
            requester_type = $3,
            reason = $4,
            status_refund_request = 'pending',
            provider_reference = NULL,
            admin_note = NULL,
            processed_by = NULL,
            processed_at = NULL,
            requested_at = NOW(),
            updated_at = NOW()
        WHERE refund_request_id = $1
          AND status_refund_request = 'rejected'
        RETURNING ${refundRequestColumns}
      `,
      [refundRequestId, requesterUserId, requesterType, reason || null],
    );
    return rows[0] || null;
  },

  async markCompleted(refundRequestId, { processedBy, providerReference = null, adminNote = null } = {}, client) {
    const { rows } = await runner(client).query(
      `
        UPDATE refund_request
        SET status_refund_request = 'completed',
            provider_reference = $2,
            admin_note = $3,
            processed_by = $4,
            processed_at = NOW(),
            updated_at = NOW()
        WHERE refund_request_id = $1
          AND status_refund_request IN ('pending', 'processing')
        RETURNING ${refundRequestColumns}
      `,
      [refundRequestId, providerReference || null, adminNote || null, processedBy || null],
    );
    return rows[0] || null;
  },

  async listAdmin({ status, page = 1, limit = 20 } = {}, client) {
    const conditions = [];
    const values = [];
    let index = 1;

    if (status) {
      conditions.push(`rr.status_refund_request = $${index}`);
      values.push(status);
      index += 1;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    values.push(Number(limit), (Number(page) - 1) * Number(limit));

    const { rows } = await runner(client).query(
      `
        SELECT
          ${qualifiedRefundRequestColumns},
          o.order_code,
          o.status_order,
          o.email_order,
          o.phone_order,
          o.total_order,
          p.payment_method,
          p.status_payment
        FROM refund_request rr
        JOIN "order" o ON o.order_id = rr.order_id
        JOIN payment p ON p.payment_id = rr.payment_id
        ${whereClause}
        ORDER BY rr.requested_at DESC, rr.refund_request_id DESC
        LIMIT $${index} OFFSET $${index + 1}
      `,
      values,
    );
    return rows;
  },

  async countAdmin({ status } = {}, client) {
    const values = [];
    let whereClause = "";
    if (status) {
      values.push(status);
      whereClause = "WHERE status_refund_request = $1";
    }
    const { rows } = await runner(client).query(
      `SELECT COUNT(*)::int AS count FROM refund_request ${whereClause}`,
      values,
    );
    return Number(rows[0]?.count || 0);
  },
};
