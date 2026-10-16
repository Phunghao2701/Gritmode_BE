import pool from "../config/database.js";

const runner = (client) => client || pool;

export const bannerRepository = {
  // --- 1. Hero Content & Marquee Settings ---
  async getHeroSettings(client) {
    const query = `
      SELECT 
        subtitle,
        title,
        description,
        marquee_text,
        updated_at
      FROM hero_settings
      WHERE id = 1;
    `;
    const { rows } = await runner(client).query(query);
    return rows[0] || {
      subtitle: "SEASON DROP 2026",
      title: "GRITMODE SIGNATURE",
      description: "Thời trang đường phố Việt Nam định hình phong cách độc bản, tự do và đậm chất bụi bặm.",
      marquee_text: "🔥 BỘ SƯU TẬP SIGNATURE STREETWEAR DROP 2026 • 100% PREMIUM HEAVYWEIGHT COTTON 280GSM • MIỄN PHÍ VẬN CHUYỂN TOÀN QUỐC",
    };
  },

  async updateHeroSettings(data, client) {
    const query = `
      INSERT INTO hero_settings (id, subtitle, title, description, marquee_text, updated_at)
      VALUES (
        1,
        COALESCE($1, 'SEASON DROP 2026'),
        COALESCE($2, 'GRITMODE SIGNATURE'),
        COALESCE($3, 'Thời trang đường phố Việt Nam định hình phong cách độc bản, tự do và đậm chất bụi bặm.'),
        COALESCE($4, ''),
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        subtitle = COALESCE($1, hero_settings.subtitle),
        title = COALESCE($2, hero_settings.title),
        description = COALESCE($3, hero_settings.description),
        marquee_text = COALESCE($4, hero_settings.marquee_text),
        updated_at = CURRENT_TIMESTAMP
      RETURNING subtitle, title, description, marquee_text, updated_at;
    `;
    const values = [
      data.subtitle !== undefined ? data.subtitle : null,
      data.title !== undefined ? data.title : null,
      data.description !== undefined ? data.description : null,
      data.marquee_text !== undefined ? data.marquee_text : null,
    ];
    const { rows } = await runner(client).query(query, values);
    return rows[0];
  },

  // --- 2. Hero Background Slides (Images) ---
  async listAll(client) {
    const query = `
      SELECT 
        banner_id,
        image_url,
        cloudinary_public_id,
        cloudinary_source_public_id,
        cloudinary_source_url,
        crop_profile,
        image_width,
        image_height,
        image_format,
        sort_order,
        is_active,
        created_at,
        updated_at
      FROM banners
      ORDER BY sort_order ASC, created_at DESC;
    `;
    const { rows } = await runner(client).query(query);
    return rows;
  },

  async listActive(client) {
    const query = `
      SELECT 
        banner_id,
        image_url,
        cloudinary_public_id,
        cloudinary_source_public_id,
        cloudinary_source_url,
        crop_profile,
        image_width,
        image_height,
        image_format,
        sort_order,
        is_active,
        created_at,
        updated_at
      FROM banners
      WHERE is_active = true
      ORDER BY sort_order ASC, created_at DESC;
    `;
    const { rows } = await runner(client).query(query);
    return rows;
  },

  async findById(bannerId, client) {
    const query = `
      SELECT 
        banner_id,
        image_url,
        cloudinary_public_id,
        cloudinary_source_public_id,
        cloudinary_source_url,
        crop_profile,
        image_width,
        image_height,
        image_format,
        sort_order,
        is_active,
        created_at,
        updated_at
      FROM banners
      WHERE banner_id = $1;
    `;
    const { rows } = await runner(client).query(query, [bannerId]);
    return rows[0] || null;
  },

  async create(data, client) {
    const query = `
      INSERT INTO banners (
        image_url,
        cloudinary_public_id,
        cloudinary_source_public_id,
        cloudinary_source_url,
        crop_profile,
        image_width,
        image_height,
        image_format,
        title,
        link_url,
        sort_order,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING banner_id, image_url, cloudinary_public_id, cloudinary_source_public_id, cloudinary_source_url, crop_profile, image_width, image_height, image_format, sort_order, is_active, created_at;
    `;
    const values = [
      data.image_url,
      data.cloudinary_public_id || null,
      data.cloudinary_source_public_id || null,
      data.cloudinary_source_url || null,
      data.crop_profile || null,
      data.image_width || null,
      data.image_height || null,
      data.image_format || null,
      data.title || 'Hero Slide',
      '/products?sort=newest',
      Number.isInteger(data.sort_order) ? data.sort_order : 0,
      typeof data.is_active === "boolean" ? data.is_active : true,
    ];
    const { rows } = await runner(client).query(query, values);
    return rows[0];
  },

  async updateStatus(bannerId, isActive, client) {
    const query = `
      UPDATE banners
      SET 
        is_active = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE banner_id = $1
      RETURNING banner_id, image_url, sort_order, is_active, updated_at;
    `;
    const { rows } = await runner(client).query(query, [bannerId, isActive]);
    return rows[0] || null;
  },

  async updateImage(bannerId, data, client) {
    const query = `
      UPDATE banners
      SET image_url = $2,
          cloudinary_public_id = $3,
          cloudinary_source_public_id = $4,
          cloudinary_source_url = $5,
          crop_profile = $6,
          image_width = $7,
          image_height = $8,
          image_format = $9,
          updated_at = CURRENT_TIMESTAMP
      WHERE banner_id = $1
      RETURNING banner_id, image_url, cloudinary_public_id, cloudinary_source_public_id, cloudinary_source_url, crop_profile, image_width, image_height, image_format, sort_order, is_active, updated_at;
    `;
    const { rows } = await runner(client).query(query, [
      bannerId,
      data.image_url,
      data.cloudinary_public_id || null,
      data.cloudinary_source_public_id || null,
      data.cloudinary_source_url || null,
      data.crop_profile || null,
      data.image_width || null,
      data.image_height || null,
      data.image_format || null,
    ]);
    return rows[0] || null;
  },

  async updateSortOrder(bannerId, sortOrder, client) {
    const query = `
      UPDATE banners
      SET 
        sort_order = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE banner_id = $1
      RETURNING banner_id, sort_order, updated_at;
    `;
    const { rows } = await runner(client).query(query, [bannerId, sortOrder]);
    return rows[0] || null;
  },

  async updateSortOrders(items = [], client) {
    for (const item of items) {
      await runner(client).query(
        `UPDATE banners SET sort_order = $2, updated_at = CURRENT_TIMESTAMP WHERE banner_id = $1`,
        [item.banner_id, item.sort_order],
      );
    }
    return this.listAll(client);
  },

  async delete(bannerId, client) {
    const query = `
      DELETE FROM banners
      WHERE banner_id = $1
      RETURNING banner_id;
    `;
    const { rows } = await runner(client).query(query, [bannerId]);
    return rows[0] || null;
  },
};
