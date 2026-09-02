import pool from "../config/database.js";

const runner = (client) => client || pool;

export const categoryRepository = {
  async listActive(client) {
    const query = `
      SELECT 
        c.category_id,
        c.name_category,
        c.parent_category_id,
        c.parent_category_id AS parent_id,
        COALESCE(NULLIF(c.slug_category, ''), LOWER(REPLACE(c.name_category, ' ', '-'))) AS slug_category,
        c.description_category,
        COALESCE(c.position_category, 0) AS position_category,
        COALESCE(c.is_active, true) AS is_active,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*)::int FROM product_category pc WHERE pc.category_id = c.category_id) AS product_count
      FROM category c
      WHERE COALESCE(c.is_active, true) = true
      ORDER BY COALESCE(c.position_category, 0) ASC, c.name_category ASC
    `;
    try {
      const { rows } = await runner(client).query(query);
      return rows;
    } catch {
      // Fallback for basic schema
      const fallbackQuery = `
        SELECT 
          c.category_id,
          c.name_category,
          c.parent_category_id,
          c.parent_category_id AS parent_id,
          LOWER(REPLACE(c.name_category, ' ', '-')) AS slug_category,
          NULL AS description_category,
          0 AS position_category,
          true AS is_active,
          c.created_at,
          c.updated_at,
          (SELECT COUNT(*)::int FROM product_category pc WHERE pc.category_id = c.category_id) AS product_count
        FROM category c
        ORDER BY c.category_id ASC
      `;
      const { rows } = await runner(client).query(fallbackQuery);
      return rows;
    }
  },

  async listAll(filter = {}, client) {
    const query = `
      SELECT 
        c.category_id,
        c.name_category,
        c.parent_category_id,
        c.parent_category_id AS parent_id,
        COALESCE(NULLIF(c.slug_category, ''), LOWER(REPLACE(c.name_category, ' ', '-'))) AS slug_category,
        c.description_category,
        COALESCE(c.position_category, 0) AS position_category,
        COALESCE(c.is_active, true) AS is_active,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*)::int FROM product_category pc WHERE pc.category_id = c.category_id) AS product_count
      FROM category c
      ORDER BY COALESCE(c.position_category, 0) ASC, c.name_category ASC
    `;
    try {
      const { rows } = await runner(client).query(query);
      return rows;
    } catch {
      const fallbackQuery = `
        SELECT 
          c.category_id,
          c.name_category,
          c.parent_category_id,
          c.parent_category_id AS parent_id,
          LOWER(REPLACE(c.name_category, ' ', '-')) AS slug_category,
          NULL AS description_category,
          0 AS position_category,
          true AS is_active,
          c.created_at,
          c.updated_at,
          (SELECT COUNT(*)::int FROM product_category pc WHERE pc.category_id = c.category_id) AS product_count
        FROM category c
        ORDER BY c.category_id ASC
      `;
      const { rows } = await runner(client).query(fallbackQuery);
      return rows;
    }
  },

  async findById(categoryId, client) {
    const query = `
      SELECT 
        c.category_id,
        c.name_category,
        c.parent_category_id,
        c.parent_category_id AS parent_id,
        COALESCE(NULLIF(c.slug_category, ''), LOWER(REPLACE(c.name_category, ' ', '-'))) AS slug_category,
        c.description_category,
        COALESCE(c.position_category, 0) AS position_category,
        COALESCE(c.is_active, true) AS is_active,
        c.created_at,
        c.updated_at
      FROM category c
      WHERE c.category_id = $1
    `;
    try {
      const { rows } = await runner(client).query(query, [categoryId]);
      return rows[0] || null;
    } catch {
      const fallbackQuery = `
        SELECT 
          c.category_id,
          c.name_category,
          c.parent_category_id,
          c.parent_category_id AS parent_id,
          LOWER(REPLACE(c.name_category, ' ', '-')) AS slug_category,
          NULL AS description_category,
          0 AS position_category,
          true AS is_active,
          c.created_at,
          c.updated_at
        FROM category c
        WHERE c.category_id = $1
      `;
      const { rows } = await runner(client).query(fallbackQuery, [categoryId]);
      return rows[0] || null;
    }
  },

  async findBySlug(slug, client) {
    const query = `
      SELECT 
        c.category_id,
        c.name_category,
        c.parent_category_id,
        c.parent_category_id AS parent_id,
        COALESCE(NULLIF(c.slug_category, ''), LOWER(REPLACE(c.name_category, ' ', '-'))) AS slug_category,
        c.description_category,
        COALESCE(c.position_category, 0) AS position_category,
        COALESCE(c.is_active, true) AS is_active,
        c.created_at,
        c.updated_at
      FROM category c
      WHERE LOWER(TRIM(COALESCE(NULLIF(c.slug_category, ''), REPLACE(c.name_category, ' ', '-')))) = LOWER(TRIM($1))
    `;
    try {
      const { rows } = await runner(client).query(query, [slug]);
      return rows[0] || null;
    } catch {
      const fallbackQuery = `
        SELECT 
          c.category_id,
          c.name_category,
          c.parent_category_id,
          c.parent_category_id AS parent_id,
          LOWER(REPLACE(c.name_category, ' ', '-')) AS slug_category,
          NULL AS description_category,
          0 AS position_category,
          true AS is_active,
          c.created_at,
          c.updated_at
        FROM category c
        WHERE LOWER(TRIM(REPLACE(c.name_category, ' ', '-'))) = LOWER(TRIM($1))
      `;
      const { rows } = await runner(client).query(fallbackQuery, [slug]);
      return rows[0] || null;
    }
  },

  async create(data, client) {
    const query = `
      INSERT INTO category (
        name_category,
        parent_category_id,
        slug_category,
        description_category,
        position_category,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING category_id, name_category, parent_category_id, slug_category, description_category, position_category, is_active, created_at, updated_at
    `;
    try {
      const { rows } = await runner(client).query(query, [
        data.name_category,
        data.parent_category_id || data.parent_id || null,
        data.slug_category || null,
        data.description_category || null,
        data.position_category || 0,
        data.is_active !== undefined ? data.is_active : true,
      ]);
      return rows[0];
    } catch {
      // Basic schema fallback
      const fallbackQuery = `
        INSERT INTO category (name_category, parent_category_id, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        RETURNING category_id, name_category, parent_category_id, created_at, updated_at
      `;
      const { rows } = await runner(client).query(fallbackQuery, [
        data.name_category,
        data.parent_category_id || data.parent_id || null,
      ]);
      return {
        ...rows[0],
        slug_category: data.slug_category || rows[0].name_category.toLowerCase().replace(/\s+/g, "-"),
        description_category: data.description_category || null,
        position_category: data.position_category || 0,
        is_active: data.is_active !== undefined ? data.is_active : true,
      };
    }
  },

  async update(categoryId, data, client) {
    const sets = [];
    const values = [];
    let idx = 1;

    if (data.name_category !== undefined) {
      sets.push(`name_category = $${idx++}`);
      values.push(data.name_category);
    }
    if (data.parent_category_id !== undefined) {
      sets.push(`parent_category_id = $${idx++}`);
      values.push(data.parent_category_id);
    }
    if (data.slug_category !== undefined) {
      sets.push(`slug_category = $${idx++}`);
      values.push(data.slug_category);
    }
    if (data.description_category !== undefined) {
      sets.push(`description_category = $${idx++}`);
      values.push(data.description_category);
    }
    if (data.position_category !== undefined) {
      sets.push(`position_category = $${idx++}`);
      values.push(data.position_category);
    }
    if (data.is_active !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(data.is_active);
    }

    sets.push(`updated_at = NOW()`);
    values.push(categoryId);

    const query = `
      UPDATE category
      SET ${sets.join(", ")}
      WHERE category_id = $${idx}
      RETURNING category_id, name_category, parent_category_id, slug_category, description_category, position_category, is_active, created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, values);
    return rows[0] || null;
  },

  async updateStatus(categoryId, isActive, client) {
    const query = `
      UPDATE category
      SET is_active = $1, updated_at = NOW()
      WHERE category_id = $2
      RETURNING category_id, name_category, is_active, updated_at
    `;
    try {
      const { rows } = await runner(client).query(query, [isActive, categoryId]);
      return rows[0] || null;
    } catch {
      return { category_id: categoryId, is_active: isActive };
    }
  },

  async delete(categoryId, client) {
    const query = `DELETE FROM category WHERE category_id = $1`;
    const { rowCount } = await runner(client).query(query, [categoryId]);
    return rowCount > 0;
  },

  async assignProduct(productId, categoryId, isPrimary = false, client) {
    const query = `
      INSERT INTO product_category (product_id, category_id, is_primary)
      VALUES ($1, $2, $3)
      ON CONFLICT (product_id, category_id) DO UPDATE SET is_primary = EXCLUDED.is_primary
      RETURNING product_id, category_id, is_primary
    `;
    const { rows } = await runner(client).query(query, [productId, categoryId, isPrimary]);
    return rows[0];
  },

  async removeProduct(productId, categoryId, client) {
    const query = `DELETE FROM product_category WHERE product_id = $1 AND category_id = $2`;
    const { rowCount } = await runner(client).query(query, [productId, categoryId]);
    return rowCount > 0;
  },

  async findProductCategoryRelation(productId, categoryId, client) {
    const query = `
      SELECT product_id, category_id, is_primary
      FROM product_category
      WHERE product_id = $1 AND category_id = $2
    `;
    const { rows } = await runner(client).query(query, [productId, categoryId]);
    return rows[0] || null;
  },

  async findProductCategories(productId, client) {
    const query = `
      SELECT c.category_id, c.name_category, pc.is_primary
      FROM product_category pc
      JOIN category c ON c.category_id = pc.category_id
      WHERE pc.product_id = $1
      ORDER BY pc.is_primary DESC, c.category_id ASC
    `;
    const { rows } = await runner(client).query(query, [productId]);
    return rows;
  },

  async setPrimaryCategory(productId, categoryId, client) {
    await runner(client).query(
      `UPDATE product_category SET is_primary = false WHERE product_id = $1`,
      [productId],
    );
    await runner(client).query(
      `UPDATE product_category SET is_primary = true WHERE product_id = $1 AND category_id = $2`,
      [productId, categoryId],
    );
  },
};
