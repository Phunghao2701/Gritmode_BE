import pool from "../config/database.js";

const runner = (client) => client || pool;

const LOW_STOCK_THRESHOLD = 5;

/**
 * Build ORDER BY clause from sort param.
 * quantity_available is computed as (quantity_stock - quantity_reserved) in SQL.
 */
const buildOrderBy = (sort) => {
  switch (sort) {
    case "stock_asc":    return "inv.quantity_stock ASC";
    case "stock_desc":   return "inv.quantity_stock DESC";
    case "available_asc":  return "(inv.quantity_stock - inv.quantity_reserved) ASC";
    case "available_desc": return "(inv.quantity_stock - inv.quantity_reserved) DESC";
    case "sku_asc":      return "pv.sku ASC";
    case "sku_desc":     return "pv.sku DESC";
    case "updated_desc":
    default:             return "inv.updated_at DESC";
  }
};

/**
 * Build WHERE clause conditions for filtering.
 */
const buildWhere = (filter) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filter.search) {
    conditions.push(
      `(p.name_product ILIKE $${idx} OR pv.sku ILIKE $${idx})`,
    );
    params.push(`%${filter.search}%`);
    idx += 1;
  }

  if (filter.low_stock) {
    conditions.push(
      `(inv.quantity_stock - inv.quantity_reserved) <= ${LOW_STOCK_THRESHOLD} AND (inv.quantity_stock - inv.quantity_reserved) > 0`,
    );
  }

  if (filter.out_of_stock) {
    conditions.push(`(inv.quantity_stock - inv.quantity_reserved) <= 0`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, params, nextIdx: idx };
};

const BASE_SELECT = `
  SELECT
    inv.inventory_id,
    inv.product_variant_id,
    inv.quantity_stock,
    inv.quantity_reserved,
    (inv.quantity_stock - inv.quantity_reserved) AS quantity_available,
    inv.created_at,
    inv.updated_at,
    pv.product_id,
    pv.sku,
    p.name_product
  FROM inventory inv
  JOIN product_variant pv ON pv.product_variant_id = inv.product_variant_id
  JOIN product p ON p.product_id = pv.product_id
`;

export const inventoryRepository = {
  /**
   * Find inventory record with JOIN data for a specific variant.
   */
  async findByVariantId(variantId, client) {
    const query = `
      ${BASE_SELECT}
      WHERE inv.product_variant_id = $1
    `;
    const { rows } = await runner(client).query(query, [variantId]);
    return rows[0] || null;
  },

  /**
   * Lock inventory row FOR UPDATE during checkout transaction.
   */
  async lockStockByVariantId(variantId, client) {
    const query = `
      SELECT inventory_id, product_variant_id, quantity_stock, quantity_reserved,
             (quantity_stock - quantity_reserved) AS quantity_available
      FROM inventory
      WHERE product_variant_id = $1
      FOR UPDATE
    `;
    const { rows } = await runner(client).query(query, [variantId]);
    return rows[0] || null;
  },

  /**
   * List all inventories with pagination, search, low-stock, out-of-stock filters.
   */
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

  /**
   * Count total inventory records matching filter.
   */
  async countAll(filter = {}, client) {
    const { whereClause, params } = buildWhere(filter);
    const query = `
      SELECT COUNT(*) AS count
      FROM inventory inv
      JOIN product_variant pv ON pv.product_variant_id = inv.product_variant_id
      JOIN product p ON p.product_id = pv.product_id
      ${whereClause}
    `;
    const { rows } = await runner(client).query(query, params);
    return parseInt(rows[0]?.count || "0", 10);
  },

  /**
   * Update quantity_stock for a variant's inventory.
   * Returns the updated row (with SELECT FOR UPDATE semantics handled at service level).
   */
  async updateStock(variantId, quantityStock, client) {
    const query = `
      UPDATE inventory
      SET quantity_stock = $1, updated_at = NOW()
      WHERE product_variant_id = $2
      RETURNING inventory_id, product_variant_id, quantity_stock, quantity_reserved,
                (quantity_stock - quantity_reserved) AS quantity_available,
                created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, [quantityStock, variantId]);
    return rows[0] || null;
  },

  /**
   * Atomically reserve stock — prevents overselling via conditional UPDATE.
   * Returns null (not enough stock) or the updated row.
   */
  async reserveStock(variantId, qty, client) {
    const query = `
      UPDATE inventory
      SET quantity_reserved = quantity_reserved + $1,
          updated_at = NOW()
      WHERE product_variant_id = $2
        AND (quantity_stock - quantity_reserved) >= $1
      RETURNING inventory_id, product_variant_id, quantity_stock, quantity_reserved,
                (quantity_stock - quantity_reserved) AS quantity_available,
                created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, [qty, variantId]);
    return rows[0] || null;
  },

  /**
   * Atomically release reserved stock (Order cancellation).
   * Ensures reserved never goes negative.
   */
  async releaseReservedStock(variantId, qty, client) {
    const query = `
      UPDATE inventory
      SET quantity_reserved = GREATEST(0, quantity_reserved - $1),
          updated_at = NOW()
      WHERE product_variant_id = $2
      RETURNING inventory_id, product_variant_id, quantity_stock, quantity_reserved,
                (quantity_stock - quantity_reserved) AS quantity_available,
                created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, [qty, variantId]);
    return rows[0] || null;
  },

  /**
   * Atomically commit reserved stock (Order completion):
   * decrements both quantity_stock and quantity_reserved by qty.
   */
  async commitReservedStock(variantId, qty, client) {
    const query = `
      UPDATE inventory
      SET quantity_stock    = quantity_stock - $1,
          quantity_reserved = GREATEST(0, quantity_reserved - $1),
          updated_at = NOW()
      WHERE product_variant_id = $2
        AND quantity_stock >= $1
        AND quantity_reserved >= $1
      RETURNING inventory_id, product_variant_id, quantity_stock, quantity_reserved,
                (quantity_stock - quantity_reserved) AS quantity_available,
                created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, [qty, variantId]);
    return rows[0] || null;
  },
};
