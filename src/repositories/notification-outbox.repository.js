import pool from "../config/database.js";

const runner = (client) => client || pool;

const outboxColumns = `
  notification_outbox_id,
  channel,
  event_type,
  destination,
  dedupe_key,
  payload,
  status,
  attempt_count,
  next_attempt_at,
  locked_at,
  last_error,
  sent_at,
  created_at,
  updated_at
`;

const outboxReturningColumns = `
  outbox.notification_outbox_id,
  outbox.channel,
  outbox.event_type,
  outbox.destination,
  outbox.dedupe_key,
  outbox.payload,
  outbox.status,
  outbox.attempt_count,
  outbox.next_attempt_at,
  outbox.locked_at,
  outbox.last_error,
  outbox.sent_at,
  outbox.created_at,
  outbox.updated_at
`;

export const notificationOutboxRepository = {
  async enqueue({ channel = "email", eventType, destination, dedupeKey, payload = {} }, client) {
    const { rows } = await runner(client).query(
      `
        INSERT INTO notification_outbox
          (channel, event_type, destination, dedupe_key, payload)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING ${outboxColumns}
      `,
      [channel, eventType, destination, dedupeKey, JSON.stringify(payload)],
    );

    if (rows[0]) return rows[0];

    const existing = await runner(client).query(
      `SELECT ${outboxColumns} FROM notification_outbox WHERE dedupe_key = $1`,
      [dedupeKey],
    );
    return existing.rows[0] || null;
  },

  async claimBatch({ limit = 10 } = {}, client) {
    const { rows } = await runner(client).query(
      `
        WITH candidates AS (
          SELECT notification_outbox_id
          FROM notification_outbox
          WHERE (
            (status IN ('pending', 'failed') AND next_attempt_at <= NOW())
            OR (status = 'processing' AND locked_at <= NOW() - INTERVAL '5 minutes')
          )
          ORDER BY next_attempt_at ASC, notification_outbox_id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE notification_outbox AS outbox
        SET
          status = 'processing',
          locked_at = NOW(),
          attempt_count = outbox.attempt_count + 1,
          updated_at = NOW()
        FROM candidates
        WHERE outbox.notification_outbox_id = candidates.notification_outbox_id
        RETURNING ${outboxReturningColumns}
      `,
      [Math.max(1, Math.min(Number(limit) || 10, 100))],
    );
    return rows;
  },

  async markSent(notificationOutboxId, client) {
    const { rows } = await runner(client).query(
      `
        UPDATE notification_outbox
        SET status = 'sent', sent_at = NOW(), locked_at = NULL, updated_at = NOW()
        WHERE notification_outbox_id = $1
        RETURNING ${outboxColumns}
      `,
      [notificationOutboxId],
    );
    return rows[0] || null;
  },

  async markFailed(notificationOutboxId, { error, nextAttemptAt, deadLetter = false } = {}, client) {
    const { rows } = await runner(client).query(
      `
        UPDATE notification_outbox
        SET
          status = $2,
          last_error = $3,
          next_attempt_at = COALESCE($4, next_attempt_at),
          locked_at = NULL,
          updated_at = NOW()
        WHERE notification_outbox_id = $1
        RETURNING ${outboxColumns}
      `,
      [
        notificationOutboxId,
        deadLetter ? "dead_letter" : "failed",
        error ? String(error).slice(0, 4000) : null,
        nextAttemptAt || null,
      ],
    );
    return rows[0] || null;
  },
};
