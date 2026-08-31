import pool from "../config/database.js";

const runner = (client) => client || pool;

const buildOrderBy = (sort) => {
  switch (sort) {
    case "code_asc":
      return "v.code_voucher ASC";
    case "code_desc":
      return "v.code_voucher DESC";
    case "created_asc":
      return "v.created_at ASC";
    case "end_at_asc":
      return "v.end_at ASC NULLS LAST";
    case "end_at_desc":
      return "v.end_at DESC NULLS LAST";
    case "created_desc":
    default:
      return "v.created_at DESC";
  }
};

const buildWhere = (filter) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filter.search) {
    conditions.push(`(v.code_voucher ILIKE $${idx} OR v.name_voucher ILIKE $${idx})`);
    params.push(`%${filter.search}%`);
    idx += 1;
  }

  if (filter.discount_type) {
    conditions.push(`v.discount_type = $${idx}`);
    params.push(filter.discount_type);
    idx += 1;
  }

  if (filter.is_active !== undefined) {
    conditions.push(`v.is_active = $${idx}`);
    params.push(Boolean(filter.is_active));
    idx += 1;
  }

  if (filter.status) {
    switch (filter.status) {
      case "inactive":
        conditions.push(`v.is_active = false`);
        break;
      case "scheduled":
        conditions.push(`v.is_active = true AND v.start_at IS NOT NULL AND v.start_at > NOW()`);
        break;
      case "expired":
        conditions.push(`v.is_active = true AND v.end_at IS NOT NULL AND v.end_at < NOW()`);
        break;
      case "exhausted":
        conditions.push(`v.is_active = true AND v.usage_limit IS NOT NULL AND v.usage_count >= v.usage_limit`);
        break;
      case "active":
        conditions.push(
          `v.is_active = true AND (v.start_at IS NULL OR v.start_at <= NOW()) AND (v.end_at IS NULL OR v.end_at >= NOW()) AND (v.usage_limit IS NULL OR v.usage_count < v.usage_limit)`
        );
        break;
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, params, nextIdx: idx };
};

const BASE_SELECT = `
  SELECT 
    v.voucher_id,
    v.code_voucher,
    v.name_voucher,
    v.discount_type,
    v.discount_value::bigint AS discount_value,
    v.minimum_order_amount::bigint AS minimum_order_amount,
    v.maximum_discount_amount::bigint AS maximum_discount_amount,
    v.usage_limit,
    v.usage_count,
    v.start_at,
    v.end_at,
    v.is_active,
    v.created_at,
    v.updated_at
  FROM voucher v
`;

export const voucherRepository = {
  async findByCode(code, client) {
    if (!code) return null;
    const query = `
      ${BASE_SELECT}
      WHERE LOWER(TRIM(v.code_voucher)) = LOWER(TRIM($1))
      LIMIT 1
    `;
    const { rows } = await runner(client).query(query, [code]);
    return rows[0] || null;
  },

  async findById(voucherId, client) {
    const query = `
      ${BASE_SELECT}
      WHERE v.voucher_id = $1
      LIMIT 1
    `;
    const { rows } = await runner(client).query(query, [voucherId]);
    return rows[0] || null;
  },

  async findAll(filter = {}, client) {
    const { whereClause, params, nextIdx } = buildWhere(filter);
    const order = buildOrderBy(filter.sort);
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    const query = `
      ${BASE_SELECT}
      ${whereClause}
      ORDER BY ${order}
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;
    const { rows } = await runner(client).query(query, [...params, limit, offset]);
    return rows;
  },

  async countAll(filter = {}, client) {
    const { whereClause, params } = buildWhere(filter);
    const query = `
      SELECT COUNT(*) AS count
      FROM voucher v
      ${whereClause}
    `;
    const { rows } = await runner(client).query(query, params);
    return parseInt(rows[0]?.count || "0", 10);
  },

  async create(data, client) {
    const query = `
      INSERT INTO voucher (
        code_voucher,
        name_voucher,
        discount_type,
        discount_value,
        minimum_order_amount,
        maximum_discount_amount,
        usage_limit,
        usage_count,
        start_at,
        end_at,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, NOW(), NOW()
      )
      RETURNING 
        voucher_id,
        code_voucher,
        name_voucher,
        discount_type,
        discount_value::bigint AS discount_value,
        minimum_order_amount::bigint AS minimum_order_amount,
        maximum_discount_amount::bigint AS maximum_discount_amount,
        usage_limit,
        usage_count,
        start_at,
        end_at,
        is_active,
        created_at,
        updated_at
    `;
    const values = [
      data.code_voucher.trim().toUpperCase(),
      data.name_voucher.trim(),
      data.discount_type,
      data.discount_value,
      data.minimum_order_amount ?? 0,
      data.maximum_discount_amount ?? null,
      data.usage_limit ?? null,
      data.start_at ?? null,
      data.end_at ?? null,
      data.is_active ?? true,
    ];
    const { rows } = await runner(client).query(query, values);
    return rows[0];
  },

  async update(voucherId, data, client) {
    const sets = [];
    const values = [];
    let idx = 1;

    if (data.code_voucher !== undefined) {
      sets.push(`code_voucher = $${idx++}`);
      values.push(data.code_voucher.trim().toUpperCase());
    }
    if (data.name_voucher !== undefined) {
      sets.push(`name_voucher = $${idx++}`);
      values.push(data.name_voucher.trim());
    }
    if (data.discount_type !== undefined) {
      sets.push(`discount_type = $${idx++}`);
      values.push(data.discount_type);
    }
    if (data.discount_value !== undefined) {
      sets.push(`discount_value = $${idx++}`);
      values.push(data.discount_value);
    }
    if (data.minimum_order_amount !== undefined) {
      sets.push(`minimum_order_amount = $${idx++}`);
      values.push(data.minimum_order_amount);
    }
    if (data.maximum_discount_amount !== undefined) {
      sets.push(`maximum_discount_amount = $${idx++}`);
      values.push(data.maximum_discount_amount);
    }
    if (data.usage_limit !== undefined) {
      sets.push(`usage_limit = $${idx++}`);
      values.push(data.usage_limit);
    }
    if (data.start_at !== undefined) {
      sets.push(`start_at = $${idx++}`);
      values.push(data.start_at);
    }
    if (data.end_at !== undefined) {
      sets.push(`end_at = $${idx++}`);
      values.push(data.end_at);
    }
    if (data.is_active !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(data.is_active);
    }

    sets.push(`updated_at = NOW()`);
    values.push(voucherId);

    const query = `
      UPDATE voucher
      SET ${sets.join(", ")}
      WHERE voucher_id = $${idx}
      RETURNING 
        voucher_id,
        code_voucher,
        name_voucher,
        discount_type,
        discount_value::bigint AS discount_value,
        minimum_order_amount::bigint AS minimum_order_amount,
        maximum_discount_amount::bigint AS maximum_discount_amount,
        usage_limit,
        usage_count,
        start_at,
        end_at,
        is_active,
        created_at,
        updated_at
    `;
    const { rows } = await runner(client).query(query, values);
    return rows[0] || null;
  },

  async updateStatus(voucherId, isActive, client) {
    const query = `
      UPDATE voucher
      SET is_active = $1, updated_at = NOW()
      WHERE voucher_id = $2
      RETURNING 
        voucher_id,
        code_voucher,
        name_voucher,
        discount_type,
        discount_value::bigint AS discount_value,
        minimum_order_amount::bigint AS minimum_order_amount,
        maximum_discount_amount::bigint AS maximum_discount_amount,
        usage_limit,
        usage_count,
        start_at,
        end_at,
        is_active,
        created_at,
        updated_at
    `;
    const { rows } = await runner(client).query(query, [Boolean(isActive), voucherId]);
    return rows[0] || null;
  },

  async delete(voucherId, client) {
    const query = `DELETE FROM voucher WHERE voucher_id = $1`;
    const { rowCount } = await runner(client).query(query, [voucherId]);
    return rowCount > 0;
  },

  async hasOrderReferences(voucherId, client) {
    const query = `
      SELECT (
        EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'order' OR table_name = 'orders'
        ) AND EXISTS (
          SELECT 1 FROM "order" WHERE voucher_id = $1
        )
      ) AS has_ref
    `;
    try {
      const { rows } = await runner(client).query(query, [voucherId]);
      if (rows[0]?.has_ref !== undefined) {
        return Boolean(rows[0].has_ref);
      }
      return Boolean(Number(rows[0]?.count || 0) > 0);
    } catch {
      return false;
    }
  },

  async incrementUsage(voucherId, client) {
    const query = `
      UPDATE voucher
      SET usage_count = usage_count + 1,
          updated_at = NOW()
      WHERE voucher_id = $1
        AND (usage_limit IS NULL OR usage_count < usage_limit)
      RETURNING 
        voucher_id,
        code_voucher,
        name_voucher,
        discount_type,
        discount_value::bigint AS discount_value,
        minimum_order_amount::bigint AS minimum_order_amount,
        maximum_discount_amount::bigint AS maximum_discount_amount,
        usage_limit,
        usage_count,
        start_at,
        end_at,
        is_active,
        created_at,
        updated_at
    `;
    const { rows } = await runner(client).query(query, [voucherId]);
    return rows[0] || null;
  },
};
