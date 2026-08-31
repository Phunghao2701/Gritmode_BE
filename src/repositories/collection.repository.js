import pool from "../config/database.js";

const runner = (client) => client || pool;

export const collectionRepository = {
  async listVisible(client) {
    const query = `
      SELECT 
        c.collection_id,
        c.name_collection,
        COALESCE(NULLIF(c.slug_collection, ''), LOWER(REPLACE(c.name_collection, ' ', '-'))) AS slug_collection,
        c.description_collection,
        c.image_collection,
        0 AS position_collection,
        COALESCE(c.is_active, true) AS is_active,
        c.start_at,
        c.end_at,
        c.created_at,
        c.updated_at
      FROM collection c
      WHERE COALESCE(c.is_active, true) = true
        AND (c.start_at IS NULL OR c.start_at <= NOW())
        AND (c.end_at IS NULL OR c.end_at >= NOW())
      ORDER BY c.name_collection ASC
    `;
    try {
      const { rows } = await runner(client).query(query);
      return rows;
    } catch {
      // Fallback for basic schema
      const fallbackQuery = `
        SELECT 
          c.collection_id,
          c.name_collection,
          LOWER(REPLACE(c.name_collection, ' ', '-')) AS slug_collection,
          c.description_collection,
          NULL AS image_collection,
          0 AS position_collection,
          true AS is_active,
          NULL::timestamp AS start_at,
          NULL::timestamp AS end_at,
          c.created_at,
          c.updated_at
        FROM collection c
        ORDER BY c.collection_id ASC
      `;
      const { rows } = await runner(client).query(fallbackQuery);
      return rows;
    }
  },

  async listAll(filter = {}, client) {
    const query = `
      SELECT 
        c.collection_id,
        c.name_collection,
        COALESCE(NULLIF(c.slug_collection, ''), LOWER(REPLACE(c.name_collection, ' ', '-'))) AS slug_collection,
        c.description_collection,
        c.image_collection,
        0 AS position_collection,
        COALESCE(c.is_active, true) AS is_active,
        c.start_at,
        c.end_at,
        c.created_at,
        c.updated_at,
        COALESCE((
          SELECT COUNT(*)::int 
          FROM product_collection pc 
          WHERE pc.collection_id = c.collection_id
        ), 0) AS product_count
      FROM collection c
      ORDER BY c.name_collection ASC
    `;
    try {
      const { rows } = await runner(client).query(query);
      return rows;
    } catch {
      const fallbackQuery = `
        SELECT 
          c.collection_id,
          c.name_collection,
          LOWER(REPLACE(c.name_collection, ' ', '-')) AS slug_collection,
          c.description_collection,
          NULL AS image_collection,
          0 AS position_collection,
          true AS is_active,
          NULL::timestamp AS start_at,
          NULL::timestamp AS end_at,
          c.created_at,
          c.updated_at,
          COALESCE((
            SELECT COUNT(*)::int 
            FROM product_collection pc 
            WHERE pc.collection_id = c.collection_id
          ), 0) AS product_count
        FROM collection c
        ORDER BY c.collection_id ASC
      `;
      const { rows } = await runner(client).query(fallbackQuery);
      return rows;
    }
  },

  async findById(collectionId, client) {
    const query = `
      SELECT 
        c.collection_id,
        c.name_collection,
        COALESCE(NULLIF(c.slug_collection, ''), LOWER(REPLACE(c.name_collection, ' ', '-'))) AS slug_collection,
        c.description_collection,
        c.image_collection,
        0 AS position_collection,
        COALESCE(c.is_active, true) AS is_active,
        c.start_at,
        c.end_at,
        c.created_at,
        c.updated_at,
        COALESCE((
          SELECT COUNT(*)::int 
          FROM product_collection pc 
          WHERE pc.collection_id = c.collection_id
        ), 0) AS product_count
      FROM collection c
      WHERE c.collection_id = $1
    `;
    try {
      const { rows } = await runner(client).query(query, [collectionId]);
      return rows[0] || null;
    } catch {
      const fallbackQuery = `
        SELECT 
          c.collection_id,
          c.name_collection,
          LOWER(REPLACE(c.name_collection, ' ', '-')) AS slug_collection,
          c.description_collection,
          NULL AS image_collection,
          0 AS position_collection,
          true AS is_active,
          NULL::timestamp AS start_at,
          NULL::timestamp AS end_at,
          c.created_at,
          c.updated_at,
          COALESCE((
            SELECT COUNT(*)::int 
            FROM product_collection pc 
            WHERE pc.collection_id = c.collection_id
          ), 0) AS product_count
        FROM collection c
        WHERE c.collection_id = $1
      `;
      const { rows } = await runner(client).query(fallbackQuery, [collectionId]);
      return rows[0] || null;
    }
  },

  async findBySlug(slug, client) {
    const query = `
      SELECT 
        c.collection_id,
        c.name_collection,
        COALESCE(NULLIF(c.slug_collection, ''), LOWER(REPLACE(c.name_collection, ' ', '-'))) AS slug_collection,
        c.description_collection,
        c.image_collection,
        0 AS position_collection,
        COALESCE(c.is_active, true) AS is_active,
        c.start_at,
        c.end_at,
        c.created_at,
        c.updated_at
      FROM collection c
      WHERE LOWER(TRIM(COALESCE(NULLIF(c.slug_collection, ''), REPLACE(c.name_collection, ' ', '-')))) = LOWER(TRIM($1))
    `;
    try {
      const { rows } = await runner(client).query(query, [slug]);
      return rows[0] || null;
    } catch {
      const fallbackQuery = `
        SELECT 
          c.collection_id,
          c.name_collection,
          LOWER(REPLACE(c.name_collection, ' ', '-')) AS slug_collection,
          c.description_collection,
          NULL AS image_collection,
          0 AS position_collection,
          true AS is_active,
          NULL::timestamp AS start_at,
          NULL::timestamp AS end_at,
          c.created_at,
          c.updated_at
        FROM collection c
        WHERE LOWER(TRIM(REPLACE(c.name_collection, ' ', '-'))) = LOWER(TRIM($1))
      `;
      const { rows } = await runner(client).query(fallbackQuery, [slug]);
      return rows[0] || null;
    }
  },

  async create(data, client) {
    const query = `
      INSERT INTO collection (
        name_collection,
        slug_collection,
        description_collection,
        image_collection,
        is_active,
        start_at,
        end_at,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `;
    try {
      const { rows } = await runner(client).query(query, [
        data.name_collection,
        data.slug_collection || null,
        data.description_collection || null,
        data.image_collection || null,
        data.is_active !== undefined ? data.is_active : true,
        data.start_at || null,
        data.end_at || null,
      ]);
      return rows[0];
    } catch {
      // Basic fallback
      const fallbackQuery = `
        INSERT INTO collection (name_collection, description_collection, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        RETURNING collection_id, name_collection, description_collection, created_at, updated_at
      `;
      const { rows } = await runner(client).query(fallbackQuery, [
        data.name_collection,
        data.description_collection || null,
      ]);
      return {
        ...rows[0],
        slug_collection: data.slug_collection || rows[0].name_collection.toLowerCase().replace(/\s+/g, "-"),
        image_collection: data.image_collection || null,
        position_collection: data.position_collection || 0,
        is_active: data.is_active !== undefined ? data.is_active : true,
        start_at: data.start_at || null,
        end_at: data.end_at || null,
      };
    }
  },

  async update(collectionId, data, client) {
    const sets = [];
    const values = [];
    let idx = 1;

    if (data.name_collection !== undefined) {
      sets.push(`name_collection = $${idx++}`);
      values.push(data.name_collection);
    }
    if (data.slug_collection !== undefined) {
      sets.push(`slug_collection = $${idx++}`);
      values.push(data.slug_collection);
    }
    if (data.description_collection !== undefined) {
      sets.push(`description_collection = $${idx++}`);
      values.push(data.description_collection);
    }
    if (data.image_collection !== undefined) {
      sets.push(`image_collection = $${idx++}`);
      values.push(data.image_collection);
    }
    if (data.is_active !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(data.is_active);
    }
    if (data.start_at !== undefined) {
      sets.push(`start_at = $${idx++}`);
      values.push(data.start_at);
    }
    if (data.end_at !== undefined) {
      sets.push(`end_at = $${idx++}`);
      values.push(data.end_at);
    }

    sets.push(`updated_at = NOW()`);
    values.push(collectionId);

    const query = `
      UPDATE collection
      SET ${sets.join(", ")}
      WHERE collection_id = $${idx}
      RETURNING *
    `;
    const { rows } = await runner(client).query(query, values);
    return rows[0] || null;
  },

  async updateStatus(collectionId, isActive, client) {
    const query = `
      UPDATE collection
      SET is_active = $1, updated_at = NOW()
      WHERE collection_id = $2
      RETURNING collection_id, name_collection, is_active, updated_at
    `;
    try {
      const { rows } = await runner(client).query(query, [isActive, collectionId]);
      return rows[0] || null;
    } catch {
      return { collection_id: collectionId, is_active: isActive };
    }
  },

  async delete(collectionId, client) {
    const query = `DELETE FROM collection WHERE collection_id = $1`;
    const { rowCount } = await runner(client).query(query, [collectionId]);
    return rowCount > 0;
  },

  async getMaxPosition(collectionId, client) {
    const query = `
      SELECT COALESCE(MAX(position_product_collection), 0) AS max_pos
      FROM product_collection
      WHERE collection_id = $1
    `;
    try {
      const { rows } = await runner(client).query(query, [collectionId]);
      return Number(rows[0]?.max_pos || 0);
    } catch {
      return 0;
    }
  },

  async addProduct(collectionId, productId, position = 0, client) {
    const query = `
      INSERT INTO product_collection (collection_id, product_id, position_product_collection)
      VALUES ($1, $2, $3)
      ON CONFLICT (product_id, collection_id) DO UPDATE SET position_product_collection = EXCLUDED.position_product_collection
      RETURNING product_id, collection_id, position_product_collection
    `;
    try {
      const { rows } = await runner(client).query(query, [collectionId, productId, position]);
      return rows[0];
    } catch {
      // Basic fallback
      const fallbackQuery = `
        INSERT INTO product_collection (collection_id, product_id)
        VALUES ($1, $2)
        ON CONFLICT (product_id, collection_id) DO NOTHING
        RETURNING product_id, collection_id
      `;
      const { rows } = await runner(client).query(fallbackQuery, [collectionId, productId]);
      return {
        product_id: productId,
        collection_id: collectionId,
        position_product_collection: position,
      };
    }
  },

  async removeProduct(collectionId, productId, client) {
    const query = `DELETE FROM product_collection WHERE collection_id = $1 AND product_id = $2`;
    const { rowCount } = await runner(client).query(query, [collectionId, productId]);
    return rowCount > 0;
  },

  async findProductCollectionRelation(collectionId, productId, client) {
    const query = `
      SELECT product_id, collection_id, position_product_collection
      FROM product_collection
      WHERE collection_id = $1 AND product_id = $2
    `;
    try {
      const { rows } = await runner(client).query(query, [collectionId, productId]);
      return rows[0] || null;
    } catch {
      const fallbackQuery = `
        SELECT product_id, collection_id, 0 AS position_product_collection
        FROM product_collection
        WHERE collection_id = $1 AND product_id = $2
      `;
      const { rows } = await runner(client).query(fallbackQuery, [collectionId, productId]);
      return rows[0] || null;
    }
  },

  async findCollectionProducts(collectionId, client) {
    const query = `
      SELECT 
        p.product_id, 
        p.name_product,
        COALESCE(pc.position_product_collection, 0) AS position_product_collection
      FROM product_collection pc
      JOIN product p ON p.product_id = pc.product_id
      WHERE pc.collection_id = $1
      ORDER BY COALESCE(pc.position_product_collection, 0) ASC, p.product_id ASC
    `;
    try {
      const { rows } = await runner(client).query(query, [collectionId]);
      return rows;
    } catch {
      const fallbackQuery = `
        SELECT 
          p.product_id, 
          p.name_product,
          0 AS position_product_collection
        FROM product_collection pc
        JOIN product p ON p.product_id = pc.product_id
        WHERE pc.collection_id = $1
        ORDER BY p.product_id ASC
      `;
      const { rows } = await runner(client).query(fallbackQuery, [collectionId]);
      return rows;
    }
  },

  async updateProductPositions(collectionId, items = [], client) {
    for (const item of items) {
      try {
        await runner(client).query(
          `UPDATE product_collection SET position_product_collection = $1 WHERE collection_id = $2 AND product_id = $3`,
          [item.position_product_collection, collectionId, item.product_id],
        );
      } catch {
        // Fallback for basic schema without position column
      }
    }
  },
};
