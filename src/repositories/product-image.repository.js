import pool from "../config/database.js";

const runner = (client) => client || pool;

export const productImageRepository = {
  async listByProduct(productId, client) {
    const query = `
      SELECT 
        pi.product_image_id,
        pi.product_id,
        pi.product_option_value_id,
        pi.url_product_image,
        pi.alt_product_image,
        pi.position_product_image,
        pi.created_at,
        pi.updated_at,
        po.name_option,
        pov.value_option
      FROM product_image pi
      LEFT JOIN product_option_value pov ON pi.product_option_value_id = pov.product_option_value_id
      LEFT JOIN product_option po ON pov.product_option_id = po.product_option_id
      WHERE pi.product_id = $1
      ORDER BY pi.position_product_image ASC, pi.product_image_id ASC
    `;
    const { rows } = await runner(client).query(query, [productId]);
    return rows;
  },

  async findById(imageId, client) {
    const query = `
      SELECT 
        pi.product_image_id,
        pi.product_id,
        pi.product_option_value_id,
        pi.url_product_image,
        pi.alt_product_image,
        pi.position_product_image,
        pi.created_at,
        pi.updated_at,
        po.name_option,
        pov.value_option
      FROM product_image pi
      LEFT JOIN product_option_value pov ON pi.product_option_value_id = pov.product_option_value_id
      LEFT JOIN product_option po ON pov.product_option_id = po.product_option_id
      WHERE pi.product_image_id = $1
    `;
    const { rows } = await runner(client).query(query, [imageId]);
    return rows[0] || null;
  },

  async getMaxPosition(productId, client) {
    const query = `
      SELECT COALESCE(MAX(position_product_image), 0) AS max_position
      FROM product_image
      WHERE product_id = $1
    `;
    const { rows } = await runner(client).query(query, [productId]);
    return Number.parseInt(rows[0]?.max_position || "0", 10);
  },

  async create(productId, data, client) {
    const query = `
      INSERT INTO product_image (
        product_id,
        product_option_value_id,
        url_product_image,
        alt_product_image,
        position_product_image,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING product_image_id, product_id, product_option_value_id, url_product_image, alt_product_image, position_product_image, created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, [
      productId,
      data.product_option_value_id || null,
      data.url_product_image,
      data.alt_product_image || null,
      data.position_product_image !== undefined ? data.position_product_image : 0,
    ]);
    return rows[0];
  },

  async update(imageId, data, client) {
    const sets = [];
    const values = [];
    let idx = 1;

    if (data.url_product_image !== undefined) {
      sets.push(`url_product_image = $${idx++}`);
      values.push(data.url_product_image);
    }
    if (data.product_option_value_id !== undefined) {
      sets.push(`product_option_value_id = $${idx++}`);
      values.push(data.product_option_value_id);
    }
    if (data.alt_product_image !== undefined) {
      sets.push(`alt_product_image = $${idx++}`);
      values.push(data.alt_product_image);
    }
    if (data.position_product_image !== undefined) {
      sets.push(`position_product_image = $${idx++}`);
      values.push(data.position_product_image);
    }

    sets.push(`updated_at = NOW()`);
    values.push(imageId);

    const query = `
      UPDATE product_image
      SET ${sets.join(", ")}
      WHERE product_image_id = $${idx}
      RETURNING product_image_id, product_id, product_option_value_id, url_product_image, alt_product_image, position_product_image, created_at, updated_at
    `;
    const { rows } = await runner(client).query(query, values);
    return rows[0] || null;
  },

  async delete(imageId, client) {
    const query = `DELETE FROM product_image WHERE product_image_id = $1`;
    const { rowCount } = await runner(client).query(query, [imageId]);
    return rowCount > 0;
  },

  async findImagesByIds(imageIds, client) {
    if (!imageIds || imageIds.length === 0) return [];
    const query = `
      SELECT product_image_id, product_id, position_product_image
      FROM product_image
      WHERE product_image_id = ANY($1::bigint[])
    `;
    const { rows } = await runner(client).query(query, [imageIds]);
    return rows;
  },

  async updatePositions(images, client) {
    for (const item of images) {
      await runner(client).query(
        `UPDATE product_image SET position_product_image = $2, updated_at = NOW() WHERE product_image_id = $1`,
        [item.product_image_id, item.position_product_image],
      );
    }
  },
};
