import pool from "../config/database.js";

const runner = (client) => client || pool;

export const productOptionRepository = {
  async listByProduct(productId, client) {
    const query = `
      SELECT 
        po.product_option_id,
        po.product_id,
        po.name_option,
        po.created_at,
        po.updated_at,
        pov.product_option_value_id,
        pov.value_option
      FROM product_option po
      LEFT JOIN product_option_value pov ON po.product_option_id = pov.product_option_id
      WHERE po.product_id = $1
      ORDER BY po.product_option_id ASC, pov.product_option_value_id ASC
    `;
    const { rows } = await runner(client).query(query, [productId]);

    const optionsMap = new Map();
    for (const row of rows) {
      if (!optionsMap.has(row.product_option_id)) {
        optionsMap.set(row.product_option_id, {
          product_option_id: row.product_option_id,
          name_option: row.name_option,
          values: [],
        });
      }
      if (row.product_option_value_id) {
        optionsMap.get(row.product_option_id).values.push({
          product_option_value_id: row.product_option_value_id,
          value_option: row.value_option,
        });
      }
    }
    return Array.from(optionsMap.values());
  },

  async findById(optionId, client) {
    const query = `
      SELECT product_option_id, product_id, name_option, created_at, updated_at
      FROM product_option
      WHERE product_option_id = $1
    `;
    const { rows } = await runner(client).query(query, [optionId]);
    return rows[0] || null;
  },

  async findByNameAndProduct(productId, nameOption, client) {
    const query = `
      SELECT product_option_id, product_id, name_option, created_at, updated_at
      FROM product_option
      WHERE product_id = $1 AND LOWER(TRIM(name_option)) = LOWER(TRIM($2))
    `;
    const { rows } = await runner(client).query(query, [productId, nameOption]);
    return rows[0] || null;
  },

  async create(productId, { name_option }, client) {
    const query = `
      INSERT INTO product_option (product_id, name_option, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      RETURNING product_option_id, product_id, name_option, created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, [productId, name_option.trim()]);
    return rows[0];
  },

  async update(optionId, { name_option }, client) {
    const query = `
      UPDATE product_option
      SET name_option = $2, updated_at = NOW()
      WHERE product_option_id = $1
      RETURNING product_option_id, product_id, name_option, created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, [optionId, name_option.trim()]);
    return rows[0] || null;
  },

  async delete(optionId, client) {
    const query = `DELETE FROM product_option WHERE product_option_id = $1`;
    const { rowCount } = await runner(client).query(query, [optionId]);
    return rowCount > 0;
  },

  async isUsedInVariants(optionId, client) {
    const query = `
      SELECT COUNT(1) AS count
      FROM product_variant_option_value pvov
      JOIN product_option_value pov ON pvov.product_option_value_id = pov.product_option_value_id
      WHERE pov.product_option_id = $1
    `;
    const { rows } = await runner(client).query(query, [optionId]);
    return Number.parseInt(rows[0]?.count || "0", 10) > 0;
  },

  async findValueById(valueId, client) {
    const query = `
      SELECT pov.product_option_value_id, pov.product_option_id, pov.value_option, po.product_id, pov.created_at, pov.updated_at
      FROM product_option_value pov
      JOIN product_option po ON pov.product_option_id = po.product_option_id
      WHERE pov.product_option_value_id = $1
    `;
    const { rows } = await runner(client).query(query, [valueId]);
    return rows[0] || null;
  },

  async findValueByNameAndOption(optionId, valueOption, client) {
    const query = `
      SELECT product_option_value_id, product_option_id, value_option, created_at, updated_at
      FROM product_option_value
      WHERE product_option_id = $1 AND LOWER(TRIM(value_option)) = LOWER(TRIM($2))
    `;
    const { rows } = await runner(client).query(query, [optionId, valueOption]);
    return rows[0] || null;
  },

  async createValue(optionId, { value_option }, client) {
    const query = `
      INSERT INTO product_option_value (product_option_id, value_option, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      RETURNING product_option_value_id, product_option_id, value_option, created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, [optionId, value_option.trim()]);
    return rows[0];
  },

  async updateValue(valueId, { value_option }, client) {
    const query = `
      UPDATE product_option_value
      SET value_option = $2, updated_at = NOW()
      WHERE product_option_value_id = $1
      RETURNING product_option_value_id, product_option_id, value_option, created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, [valueId, value_option.trim()]);
    return rows[0] || null;
  },

  async deleteValue(valueId, client) {
    const query = `DELETE FROM product_option_value WHERE product_option_value_id = $1`;
    const { rowCount } = await runner(client).query(query, [valueId]);
    return rowCount > 0;
  },

  async isValueUsedInVariants(valueId, client) {
    const query = `
      SELECT COUNT(1) AS count
      FROM product_variant_option_value
      WHERE product_option_value_id = $1
    `;
    const { rows } = await runner(client).query(query, [valueId]);
    return Number.parseInt(rows[0]?.count || "0", 10) > 0;
  },
};
