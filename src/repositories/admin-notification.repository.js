import pool from "../config/database.js";

const runner = (client) => client || pool;

const notificationColumns = `
  admin_notification_id,
  event_type,
  entity_type,
  entity_id,
  dedupe_key,
  title,
  body,
  payload,
  created_at
`;

const qualifiedNotificationColumns = `
  notification.admin_notification_id,
  notification.event_type,
  notification.entity_type,
  notification.entity_id,
  notification.dedupe_key,
  notification.title,
  notification.body,
  notification.payload,
  notification.created_at
`;

export const adminNotificationRepository = {
  async create({ eventType, entityType, entityId, dedupeKey, title, body, payload = {} }, client) {
    const { rows } = await runner(client).query(
      `
        INSERT INTO admin_notification
          (event_type, entity_type, entity_id, dedupe_key, title, body, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING ${notificationColumns}
      `,
      [eventType, entityType || null, entityId || null, dedupeKey, title, body, JSON.stringify(payload)],
    );

    if (rows[0]) return rows[0];
    const existing = await runner(client).query(
      `SELECT ${notificationColumns} FROM admin_notification WHERE dedupe_key = $1`,
      [dedupeKey],
    );
    return existing.rows[0] || null;
  },

  async list({ adminUserId, page = 1, limit = 20, unreadOnly = false }, client) {
    const offset = (page - 1) * limit;
    const { rows } = await runner(client).query(
      `
        SELECT
          ${qualifiedNotificationColumns},
          (read_row.admin_notification_id IS NOT NULL) AS is_read
        FROM admin_notification notification
        LEFT JOIN admin_notification_read read_row
          ON read_row.admin_notification_id = notification.admin_notification_id
          AND read_row.admin_user_id = $1
        WHERE ($2::boolean = false OR read_row.admin_notification_id IS NULL)
        ORDER BY notification.created_at DESC, notification.admin_notification_id DESC
        LIMIT $3 OFFSET $4
      `,
      [adminUserId, unreadOnly, limit, offset],
    );
    return rows;
  },

  async count({ adminUserId, unreadOnly = false }, client) {
    const { rows } = await runner(client).query(
      `
        SELECT COUNT(*)::int AS count
        FROM admin_notification notification
        LEFT JOIN admin_notification_read read_row
          ON read_row.admin_notification_id = notification.admin_notification_id
          AND read_row.admin_user_id = $1
        WHERE ($2::boolean = false OR read_row.admin_notification_id IS NULL)
      `,
      [adminUserId, unreadOnly],
    );
    return rows[0]?.count || 0;
  },

  async markRead(notificationId, adminUserId, client) {
    const { rows } = await runner(client).query(
      `
        INSERT INTO admin_notification_read (admin_notification_id, admin_user_id, read_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (admin_notification_id, admin_user_id)
        DO UPDATE SET read_at = NOW()
        RETURNING admin_notification_id, admin_user_id, read_at
      `,
      [notificationId, adminUserId],
    );
    return rows[0] || null;
  },

  async markAllRead(adminUserId, client) {
    const { rows } = await runner(client).query(
      `
        INSERT INTO admin_notification_read (admin_notification_id, admin_user_id, read_at)
        SELECT notification.admin_notification_id, $1, NOW()
        FROM admin_notification notification
        LEFT JOIN admin_notification_read read_row
          ON read_row.admin_notification_id = notification.admin_notification_id
          AND read_row.admin_user_id = $1
        WHERE read_row.admin_notification_id IS NULL
        ON CONFLICT (admin_notification_id, admin_user_id)
        DO NOTHING
        RETURNING admin_notification_id
      `,
      [adminUserId],
    );
    return { marked_count: rows.length };
  },
};
