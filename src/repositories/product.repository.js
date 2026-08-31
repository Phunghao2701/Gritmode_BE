import pool from "../config/database.js";

const runner = (client) => client || pool;

const buildWhereClause = (filters, values) => {
  const conditions = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`p.name_product ILIKE $${values.length}`);
  }

  if (filters.category_id) {
    values.push(filters.category_id);
    conditions.push(`EXISTS (SELECT 1 FROM product_category pc WHERE pc.product_id = p.product_id AND pc.category_id = $${values.length})`);
  }

  if (filters.collection_id) {
    values.push(filters.collection_id);
    conditions.push(`EXISTS (SELECT 1 FROM product_collection pcol WHERE pcol.product_id = p.product_id AND pcol.collection_id = $${values.length})`);
  }

  if (filters.min_price !== undefined) {
    values.push(filters.min_price);
    conditions.push(`EXISTS (SELECT 1 FROM product_variant pv WHERE pv.product_id = p.product_id AND pv.price >= $${values.length})`);
  }

  if (filters.max_price !== undefined) {
    values.push(filters.max_price);
    conditions.push(`EXISTS (SELECT 1 FROM product_variant pv WHERE pv.product_id = p.product_id AND pv.price <= $${values.length})`);
  }

  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
};

const sortOrderMap = {
  newest: "p.created_at DESC",
  oldest: "p.created_at ASC",
  price_asc: "min_price ASC NULLS LAST, p.product_id ASC",
  price_desc: "max_price DESC NULLS LAST, p.product_id ASC",
  name_asc: "p.name_product ASC",
  name_desc: "p.name_product DESC",
};

export const productRepository = {
  async countProducts(filters = {}, client) {
    const values = [];
    const where = buildWhereClause(filters, values);
    const sql = `SELECT COUNT(*)::int AS total FROM product p ${where}`;
    const { rows } = await runner(client).query(sql, values);
    return rows[0]?.total || 0;
  },

  async findProducts(filters = {}, pagination = { page: 1, limit: 20 }, sort = "newest", client) {
    const values = [];
    const where = buildWhereClause(filters, values);

    const sortExpression = sortOrderMap[sort] || sortOrderMap.newest;
    const offset = (pagination.page - 1) * pagination.limit;

    values.push(pagination.limit);
    const limitPlaceholder = `$${values.length}`;
    values.push(offset);
    const offsetPlaceholder = `$${values.length}`;

    const sql = `
      SELECT
        p.product_id,
        p.name_product,
        p.description,
        p.created_at,
        p.updated_at,
        (
          SELECT MIN(pv.price)::numeric
          FROM product_variant pv
          WHERE pv.product_id = p.product_id
        ) AS min_price,
        (
          SELECT MAX(pv.price)::numeric
          FROM product_variant pv
          WHERE pv.product_id = p.product_id
        ) AS max_price,
        (
          SELECT pi.url_product_image
          FROM product_image pi
          WHERE pi.product_id = p.product_id
          ORDER BY (pi.product_option_value_id IS NOT NULL), pi.position_product_image ASC, pi.product_image_id ASC
          LIMIT 1
        ) AS thumbnail,
        COALESCE((
          SELECT bool_or((i.quantity_stock - i.quantity_reserved) > 0)
          FROM product_variant pv
          JOIN inventory i ON i.product_variant_id = pv.product_variant_id
          WHERE pv.product_id = p.product_id
        ), false) AS is_available
      FROM product p
      ${where}
      ORDER BY ${sortExpression}
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const { rows } = await runner(client).query(sql, values);
    return rows.map((row) => ({
      product_id: Number(row.product_id),
      name_product: row.name_product,
      description: row.description,
      thumbnail: row.thumbnail || null,
      min_price: row.min_price !== null ? Number(row.min_price) : null,
      max_price: row.max_price !== null ? Number(row.max_price) : null,
      is_available: Boolean(row.is_available),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  },

  async findById(productId, client) {
    const { rows } = await runner(client).query(
      `SELECT product_id, name_product, description, created_at, updated_at FROM product WHERE product_id = $1`,
      [productId],
    );
    if (!rows[0]) return null;
    return {
      product_id: Number(rows[0].product_id),
      name_product: rows[0].name_product,
      description: rows[0].description,
      created_at: rows[0].created_at,
      updated_at: rows[0].updated_at,
    };
  },

  async findDetail(productId, client) {
    const db = runner(client);
    const product = await this.findById(productId, db);
    if (!product) return null;

    const [imagesRes, optionsRes, variantsRes, categoriesRes, collectionsRes] = await Promise.all([
      db.query(
        `SELECT product_image_id, url_product_image, product_option_value_id, position_product_image
         FROM product_image
         WHERE product_id = $1
         ORDER BY position_product_image ASC, product_image_id ASC`,
        [productId],
      ),
      db.query(
        `SELECT po.product_option_id, po.name_option, pov.product_option_value_id, pov.value_option
         FROM product_option po
         LEFT JOIN product_option_value pov ON pov.product_option_id = po.product_option_id
         WHERE po.product_id = $1
         ORDER BY po.product_option_id ASC, pov.product_option_value_id ASC`,
        [productId],
      ),
      db.query(
        `SELECT pv.product_variant_id, pv.sku, pv.price,
                COALESCE(i.quantity_stock - i.quantity_reserved, 0) AS quantity_available,
                pov.product_option_value_id, pov.value_option
         FROM product_variant pv
         LEFT JOIN inventory i ON i.product_variant_id = pv.product_variant_id
         LEFT JOIN product_variant_option_value pvov ON pvov.product_variant_id = pv.product_variant_id
         LEFT JOIN product_option_value pov ON pov.product_option_value_id = pvov.product_option_value_id
         WHERE pv.product_id = $1
         ORDER BY pv.product_variant_id ASC`,
        [productId],
      ),
      db.query(
        `SELECT c.category_id, c.name_category, pc.is_primary
         FROM product_category pc
         JOIN category c ON c.category_id = pc.category_id
         WHERE pc.product_id = $1
         ORDER BY pc.is_primary DESC, c.category_id ASC`,
        [productId],
      ),
      db.query(
        `SELECT col.collection_id, col.name_collection
         FROM product_collection pcol
         JOIN collection col ON col.collection_id = pcol.collection_id
         WHERE pcol.product_id = $1
         ORDER BY col.collection_id ASC`,
        [productId],
      ),
    ]);

    // Aggregate options and values
    const optionsMap = new Map();
    for (const row of optionsRes.rows) {
      const optionId = Number(row.product_option_id);
      if (!optionsMap.has(optionId)) {
        optionsMap.set(optionId, {
          product_option_id: optionId,
          name_option: row.name_option,
          values: [],
        });
      }
      if (row.product_option_value_id) {
        optionsMap.get(optionId).values.push({
          product_option_value_id: Number(row.product_option_value_id),
          value_option: row.value_option,
        });
      }
    }

    // Aggregate variants and option values
    const variantsMap = new Map();
    for (const row of variantsRes.rows) {
      const variantId = Number(row.product_variant_id);
      if (!variantsMap.has(variantId)) {
        variantsMap.set(variantId, {
          product_variant_id: variantId,
          sku: row.sku,
          price: Number(row.price),
          quantity_available: Math.max(0, Number(row.quantity_available)),
          option_values: [],
        });
      }
      if (row.product_option_value_id) {
        variantsMap.get(variantId).option_values.push({
          product_option_value_id: Number(row.product_option_value_id),
          value_option: row.value_option,
        });
      }
    }

    return {
      product_id: product.product_id,
      name_product: product.name_product,
      description: product.description,
      images: imagesRes.rows.map((img) => ({
        product_image_id: Number(img.product_image_id),
        url_product_image: img.url_product_image,
        product_option_value_id: img.product_option_value_id ? Number(img.product_option_value_id) : null,
        position_product_image: Number(img.position_product_image),
      })),
      options: Array.from(optionsMap.values()),
      variants: Array.from(variantsMap.values()),
      categories: categoriesRes.rows.map((cat) => ({
        category_id: Number(cat.category_id),
        name_category: cat.name_category,
        is_primary: Boolean(cat.is_primary),
      })),
      collections: collectionsRes.rows.map((col) => ({
        collection_id: Number(col.collection_id),
        name_collection: col.name_collection,
      })),
    };
  },

  async create(data, client) {
    const { rows } = await runner(client).query(
      `INSERT INTO product (name_product, description, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING product_id, name_product, description, created_at, updated_at`,
      [data.name_product, data.description || null],
    );
    return {
      product_id: Number(rows[0].product_id),
      name_product: rows[0].name_product,
      description: rows[0].description,
      created_at: rows[0].created_at,
      updated_at: rows[0].updated_at,
    };
  },

  async update(productId, fields, client) {
    const allowed = { name_product: "name_product", description: "description" };
    const entries = Object.entries(fields).filter(([k, v]) => allowed[k] && v !== undefined);

    if (!entries.length) {
      return this.findById(productId, client);
    }

    const sets = entries.map(([key], index) => `${allowed[key]} = $${index + 2}`);
    sets.push("updated_at = NOW()");

    const { rows } = await runner(client).query(
      `UPDATE product SET ${sets.join(", ")} WHERE product_id = $1
       RETURNING product_id, name_product, description, created_at, updated_at`,
      [productId, ...entries.map(([, v]) => v)],
    );

    if (!rows[0]) return null;
    return {
      product_id: Number(rows[0].product_id),
      name_product: rows[0].name_product,
      description: rows[0].description,
      created_at: rows[0].created_at,
      updated_at: rows[0].updated_at,
    };
  },

  async delete(productId, client) {
    const db = runner(client);
    // 1. Delete inventory & variant relations
    await db.query(
      `DELETE FROM inventory WHERE product_variant_id IN (SELECT product_variant_id FROM product_variant WHERE product_id = $1)`,
      [productId],
    );
    await db.query(
      `DELETE FROM product_variant_option_value WHERE product_variant_id IN (SELECT product_variant_id FROM product_variant WHERE product_id = $1)`,
      [productId],
    );
    await db.query(
      `DELETE FROM cart_item WHERE product_variant_id IN (SELECT product_variant_id FROM product_variant WHERE product_id = $1)`,
      [productId],
    );
    await db.query(
      `DELETE FROM product_variant WHERE product_id = $1`,
      [productId],
    );

    // 2. Delete images & options
    await db.query(
      `DELETE FROM product_image WHERE product_id = $1`,
      [productId],
    );
    await db.query(
      `DELETE FROM product_option_value WHERE product_option_id IN (SELECT product_option_id FROM product_option WHERE product_id = $1)`,
      [productId],
    );
    await db.query(
      `DELETE FROM product_option WHERE product_id = $1`,
      [productId],
    );

    // 3. Delete category & collection links
    await db.query(
      `DELETE FROM product_category WHERE product_id = $1`,
      [productId],
    );
    await db.query(
      `DELETE FROM product_collection WHERE product_id = $1`,
      [productId],
    );

    // 4. Delete base product
    const { rowCount } = await db.query(
      `DELETE FROM product WHERE product_id = $1`,
      [productId],
    );
    return rowCount > 0;
  },

  async hasReferences(productId, client) {
    const db = runner(client);
    try {
      const { rowCount } = await db.query(
        `SELECT 1 FROM order_item oi
         JOIN product_variant pv ON pv.product_variant_id = oi.product_variant_id
         WHERE pv.product_id = $1 LIMIT 1`,
        [productId],
      );
      return rowCount > 0;
    } catch {
      return false;
    }
  },
};
