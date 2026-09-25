import pool from "../config/database.js";

const runner = (client) => client || pool;

export const productVariantRepository = {
  async listByProduct(productId, client) {
    const query = `
      SELECT 
        pv.product_variant_id,
        pv.product_id,
        pv.sku,
        pv.price::float AS price,
        pv.created_at,
        pv.updated_at,
        COALESCE(inv.quantity_stock, 0) AS quantity_stock,
        COALESCE(inv.quantity_reserved, 0) AS quantity_reserved,
        (COALESCE(inv.quantity_stock, 0) - COALESCE(inv.quantity_reserved, 0)) AS quantity_available,
        COALESCE(
          json_agg(
            json_build_object(
              'product_option_value_id', pov.product_option_value_id,
              'product_option_id', po.product_option_id,
              'name_option', po.name_option,
              'value_option', pov.value_option
            ) ORDER BY po.product_option_id ASC
          ) FILTER (WHERE pov.product_option_value_id IS NOT NULL),
          '[]'::json
        ) AS option_values
      FROM product_variant pv
      LEFT JOIN inventory inv ON pv.product_variant_id = inv.product_variant_id
      LEFT JOIN product_variant_option_value pvov ON pv.product_variant_id = pvov.product_variant_id
      LEFT JOIN product_option_value pov ON pvov.product_option_value_id = pov.product_option_value_id
      LEFT JOIN product_option po ON pov.product_option_id = po.product_option_id
      WHERE pv.product_id = $1
      GROUP BY pv.product_variant_id, inv.quantity_stock, inv.quantity_reserved
      ORDER BY pv.product_variant_id ASC
    `;
    const { rows } = await runner(client).query(query, [productId]);
    return rows.map((r) => ({
      ...r,
      option_values: typeof r.option_values === "string" ? JSON.parse(r.option_values) : r.option_values,
    }));
  },

  async findById(variantId, client) {
    const query = `
      SELECT 
        pv.product_variant_id,
        pv.product_id,
        pv.sku,
        pv.price::float AS price,
        pv.created_at,
        pv.updated_at,
        COALESCE(inv.quantity_stock, 0) AS quantity_stock,
        COALESCE(inv.quantity_reserved, 0) AS quantity_reserved,
        (COALESCE(inv.quantity_stock, 0) - COALESCE(inv.quantity_reserved, 0)) AS quantity_available,
        COALESCE(
          json_agg(
            json_build_object(
              'product_option_value_id', pov.product_option_value_id,
              'product_option_id', po.product_option_id,
              'name_option', po.name_option,
              'value_option', pov.value_option
            ) ORDER BY po.product_option_id ASC
          ) FILTER (WHERE pov.product_option_value_id IS NOT NULL),
          '[]'::json
        ) AS option_values
      FROM product_variant pv
      LEFT JOIN inventory inv ON pv.product_variant_id = inv.product_variant_id
      LEFT JOIN product_variant_option_value pvov ON pv.product_variant_id = pvov.product_variant_id
      LEFT JOIN product_option_value pov ON pvov.product_option_value_id = pov.product_option_value_id
      LEFT JOIN product_option po ON pov.product_option_id = po.product_option_id
      WHERE pv.product_variant_id = $1
      GROUP BY pv.product_variant_id, inv.quantity_stock, inv.quantity_reserved
    `;
    const { rows } = await runner(client).query(query, [variantId]);
    if (!rows[0]) return null;
    return {
      ...rows[0],
      option_values: typeof rows[0].option_values === "string" ? JSON.parse(rows[0].option_values) : rows[0].option_values,
    };
  },

  async findBySku(sku, client) {
    const query = `
      SELECT product_variant_id, product_id, sku, price::float AS price, created_at, updated_at
      FROM product_variant
      WHERE LOWER(TRIM(sku)) = LOWER(TRIM($1))
    `;
    const { rows } = await runner(client).query(query, [sku]);
    return rows[0] || null;
  },

  async findOptionValuesDetails(optionValueIds, client) {
    if (!optionValueIds || optionValueIds.length === 0) return [];
    const query = `
      SELECT 
        pov.product_option_value_id,
        pov.product_option_id,
        pov.value_option,
        po.product_id,
        po.name_option
      FROM product_option_value pov
      JOIN product_option po ON pov.product_option_id = po.product_option_id
      WHERE pov.product_option_value_id = ANY($1::bigint[])
    `;
    const { rows } = await runner(client).query(query, [optionValueIds]);
    return rows;
  },

  async findExistingCombinations(productId, client) {
    const query = `
      SELECT 
        pv.product_variant_id,
        COALESCE(ARRAY_AGG(pvov.product_option_value_id ORDER BY pvov.product_option_value_id ASC)
          FILTER (WHERE pvov.product_option_value_id IS NOT NULL), '{}') AS option_value_ids
      FROM product_variant pv
      LEFT JOIN product_variant_option_value pvov ON pv.product_variant_id = pvov.product_variant_id
      WHERE pv.product_id = $1
      GROUP BY pv.product_variant_id
    `;
    const { rows } = await runner(client).query(query, [productId]);
    return rows.map((r) => ({
      product_variant_id: r.product_variant_id,
      option_value_ids: (r.option_value_ids || []).map((id) => Number(id)),
    }));
  },

  async create(productId, { sku, price, sale_price: salePrice = null, sale_start_at: saleStartAt = null, sale_end_at: saleEndAt = null }, client) {
    const query = `
      INSERT INTO product_variant (product_id, sku, price, sale_price, sale_start_at, sale_end_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING product_variant_id, product_id, sku, price::float AS price, sale_price::float AS sale_price, sale_start_at, sale_end_at, created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, [productId, sku.trim().toUpperCase(), price, salePrice, saleStartAt, saleEndAt]);
    return rows[0];
  },

  async createOptionValuesMap(variantId, optionValueIds, client) {
    if (!optionValueIds || optionValueIds.length === 0) return;
    const values = optionValueIds.map((valId) => `(${Number(variantId)}, ${Number(valId)})`).join(", ");
    const query = `
      INSERT INTO product_variant_option_value (product_variant_id, product_option_value_id)
      VALUES ${values}
      ON CONFLICT DO NOTHING
    `;
    await runner(client).query(query);
  },

  async initializeInventory(variantId, client) {
    const query = `
      INSERT INTO inventory (product_variant_id, quantity_stock, quantity_reserved, created_at, updated_at)
      VALUES ($1, 0, 0, NOW(), NOW())
      ON CONFLICT (product_variant_id) DO NOTHING
    `;
    await runner(client).query(query, [variantId]);
  },

  async update(variantId, data, client) {
    const sets = [];
    const values = [];
    let idx = 1;

    if (data.sku !== undefined) {
      sets.push(`sku = $${idx++}`);
      values.push(data.sku.trim().toUpperCase());
    }
    if (data.price !== undefined) {
      sets.push(`price = $${idx++}`);
      values.push(data.price);
    }
    if (data.sale_price !== undefined) {
      sets.push(`sale_price = $${idx++}`);
      values.push(data.sale_price);
    }
    if (data.sale_start_at !== undefined) {
      sets.push(`sale_start_at = $${idx++}`);
      values.push(data.sale_start_at);
    }
    if (data.sale_end_at !== undefined) {
      sets.push(`sale_end_at = $${idx++}`);
      values.push(data.sale_end_at);
    }
    sets.push(`updated_at = NOW()`);
    values.push(variantId);

    const query = `
      UPDATE product_variant
      SET ${sets.join(", ")}
      WHERE product_variant_id = $${idx}
      RETURNING product_variant_id, product_id, sku, price::float AS price, sale_price::float AS sale_price, sale_start_at, sale_end_at, created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, values);
    return rows[0] || null;
  },

  async replaceOptionValuesMap(variantId, optionValueIds, client) {
    await runner(client).query(`DELETE FROM product_variant_option_value WHERE product_variant_id = $1`, [variantId]);
    await this.createOptionValuesMap(variantId, optionValueIds, client);
  },

  async hasReferences(variantId, client) {
    const query = `SELECT
      EXISTS (SELECT 1 FROM cart_item WHERE product_variant_id = $1)
      OR EXISTS (SELECT 1 FROM order_item WHERE product_variant_id = $1) AS has_ref`;
    try {
      const { rows } = await runner(client).query(query, [variantId]);
      return Boolean(rows[0]?.has_ref ?? (Number(rows[0]?.count) > 0));
    } catch {
      return false;
    }
  },

  async delete(variantId, client) {
    const query = `DELETE FROM product_variant WHERE product_variant_id = $1`;
    const { rowCount } = await runner(client).query(query, [variantId]);
    return rowCount > 0;
  },
};
