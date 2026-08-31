import pool from "../config/database.js";

const runner = (client) => client || pool;

const auditProjection = `
  a.admin_audit_log_id AS audit_log_id,
  a.user_id,
  a.action_admin_audit_log AS action,
  a.entity_admin_audit_log AS entity_name,
  a.entity_id_admin_audit_log AS entity_id,
  a.old_data,
  a.new_data,
  a.created_at,
  u.email AS admin_email,
  u.full_name AS admin_full_name
`;

export const auditRepository = {
  async log(
    {
      userId,
      adminUserId,
      action,
      entityName,
      entity,
      entityId,
      oldData = null,
      newData = null,
    },
    client,
  ) {
    const finalUserId = userId || adminUserId || null;
    const finalEntity = entityName || entity || "unknown";
    const finalOldData = oldData !== null && oldData !== undefined
      ? (typeof oldData === "string" ? oldData : JSON.stringify(oldData))
      : null;
    const finalNewData = newData !== null && newData !== undefined
      ? (typeof newData === "string" ? newData : JSON.stringify(newData))
      : null;

    const { rows } = await runner(client).query(
      `INSERT INTO admin_audit_log (user_id, action_admin_audit_log, entity_admin_audit_log, entity_id_admin_audit_log, old_data, new_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING admin_audit_log_id AS audit_log_id,
                 user_id,
                 action_admin_audit_log AS action,
                 entity_admin_audit_log AS entity_name,
                 entity_id_admin_audit_log AS entity_id,
                 old_data,
                 new_data,
                 created_at`,
      [
        finalUserId,
        action,
        finalEntity,
        entityId !== undefined && entityId !== null ? String(entityId) : null,
        finalOldData,
        finalNewData,
      ],
    );
    return rows[0];
  },

  async record(payload, client) {
    return this.log(payload, client);
  },

  async findAuditLogs(
    {
      page = 1,
      limit = 20,
      search,
      action,
      entity,
      entity_id,
      admin_user_id,
      from_date,
      to_date,
      sort_order = "DESC",
    } = {},
    client,
  ) {
    const conditions = [];
    const values = [];
    let idx = 1;

    if (search) {
      conditions.push(
        `(a.action_admin_audit_log ILIKE $${idx} OR a.entity_admin_audit_log ILIKE $${idx} OR a.entity_id_admin_audit_log ILIKE $${idx} OR u.email ILIKE $${idx} OR u.full_name ILIKE $${idx})`,
      );
      values.push(`%${search}%`);
      idx++;
    }

    if (action) {
      conditions.push(`a.action_admin_audit_log = $${idx}`);
      values.push(action);
      idx++;
    }

    if (entity) {
      conditions.push(`a.entity_admin_audit_log = $${idx}`);
      values.push(entity);
      idx++;
    }

    if (entity_id) {
      conditions.push(`a.entity_id_admin_audit_log = $${idx}`);
      values.push(String(entity_id));
      idx++;
    }

    if (admin_user_id) {
      conditions.push(`a.user_id = $${idx}`);
      values.push(admin_user_id);
      idx++;
    }

    if (from_date) {
      conditions.push(`a.created_at >= $${idx}`);
      values.push(new Date(from_date));
      idx++;
    }

    if (to_date) {
      conditions.push(`a.created_at <= $${idx}`);
      values.push(new Date(to_date));
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const direction = String(sort_order).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const offset = (Number(page) - 1) * Number(limit);
    values.push(Number(limit), offset);
    const limitIdx = idx;
    const offsetIdx = idx + 1;

    const query = `
      SELECT ${auditProjection}
      FROM admin_audit_log a
      LEFT JOIN "user" u ON u.user_id = a.user_id
      ${whereClause}
      ORDER BY a.created_at ${direction}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const { rows } = await runner(client).query(query, values);
    return rows;
  },

  async countAuditLogs(
    {
      search,
      action,
      entity,
      entity_id,
      admin_user_id,
      from_date,
      to_date,
    } = {},
    client,
  ) {
    const conditions = [];
    const values = [];
    let idx = 1;

    if (search) {
      conditions.push(
        `(a.action_admin_audit_log ILIKE $${idx} OR a.entity_admin_audit_log ILIKE $${idx} OR a.entity_id_admin_audit_log ILIKE $${idx} OR u.email ILIKE $${idx} OR u.full_name ILIKE $${idx})`,
      );
      values.push(`%${search}%`);
      idx++;
    }

    if (action) {
      conditions.push(`a.action_admin_audit_log = $${idx}`);
      values.push(action);
      idx++;
    }

    if (entity) {
      conditions.push(`a.entity_admin_audit_log = $${idx}`);
      values.push(entity);
      idx++;
    }

    if (entity_id) {
      conditions.push(`a.entity_id_admin_audit_log = $${idx}`);
      values.push(String(entity_id));
      idx++;
    }

    if (admin_user_id) {
      conditions.push(`a.user_id = $${idx}`);
      values.push(admin_user_id);
      idx++;
    }

    if (from_date) {
      conditions.push(`a.created_at >= $${idx}`);
      values.push(new Date(from_date));
      idx++;
    }

    if (to_date) {
      conditions.push(`a.created_at <= $${idx}`);
      values.push(new Date(to_date));
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `
      SELECT COUNT(*)::int AS total
      FROM admin_audit_log a
      LEFT JOIN "user" u ON u.user_id = a.user_id
      ${whereClause}
    `;

    const { rows } = await runner(client).query(query, values);
    return rows[0]?.total || 0;
  },

  async findById(auditLogId, client) {
    const { rows } = await runner(client).query(
      `SELECT ${auditProjection}
       FROM admin_audit_log a
       LEFT JOIN "user" u ON u.user_id = a.user_id
       WHERE a.admin_audit_log_id = $1`,
      [Number(auditLogId)],
    );
    return rows[0] || null;
  },
};
