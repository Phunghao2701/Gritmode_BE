import pool from "../config/database.js";

const runner = (client) => client || pool;

export const mediaAssetRepository = {
  async create(data, client) {
    const { rows } = await runner(client).query(`
      INSERT INTO media_assets (
        url, cloudinary_public_id, cloudinary_source_public_id, cloudinary_source_url, asset_type, crop_profile,
        image_width, image_height, image_format, original_name, status, expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'staged',NOW() + INTERVAL '1 day')
      RETURNING *
    `, [data.url, data.cloudinary_public_id, data.cloudinary_source_public_id || null, data.cloudinary_source_url || null, data.asset_type, data.crop_profile, data.image_width, data.image_height, data.image_format, data.original_name || null]);
    return rows[0];
  },

  async findById(assetId, client) {
    const { rows } = await runner(client).query("SELECT * FROM media_assets WHERE media_asset_id = $1", [assetId]);
    return rows[0] || null;
  },

  async attach(assetId, recordType, recordId, client) {
    const { rows } = await runner(client).query(`
      UPDATE media_assets SET status='attached', attached_record_type=$2, attached_record_id=$3, updated_at=NOW()
      WHERE media_asset_id=$1
        AND (status='staged' OR (status='attached' AND attached_record_type=$2 AND attached_record_id=$3))
      RETURNING *
    `, [assetId, recordType, recordId]);
    return rows[0] || null;
  },

  async markCleanupPending(assetId, error, client) {
    const { rows } = await runner(client).query(`
      UPDATE media_assets SET status='cleanup_pending', cleanup_error=$2, cleanup_attempts=cleanup_attempts+1, updated_at=NOW()
      WHERE media_asset_id=$1 RETURNING *
    `, [assetId, String(error?.message || error || "cleanup failed")]);
    return rows[0] || null;
  },

  async findByPublicId(publicId, client) {
    const { rows } = await runner(client).query("SELECT * FROM media_assets WHERE cloudinary_public_id = $1", [publicId]);
    return rows[0] || null;
  },

  async markDeleted(publicId, client) {
    const { rows } = await runner(client).query("UPDATE media_assets SET status='deleted', updated_at=NOW() WHERE cloudinary_public_id=$1 RETURNING *", [publicId]);
    return rows[0] || null;
  },

  async listCleanupPending(limit = 20, client) {
    const { rows } = await runner(client).query(`
      SELECT * FROM media_assets
      WHERE status = 'cleanup_pending'
      ORDER BY updated_at ASC
      LIMIT $1
    `, [Math.min(Math.max(Number(limit) || 20, 1), 100)]);
    return rows;
  },

  async listExpiredStaged(limit = 20, client) {
    const { rows } = await runner(client).query(`
      SELECT * FROM media_assets
      WHERE status = 'staged' AND expires_at IS NOT NULL AND expires_at <= NOW()
      ORDER BY expires_at ASC
      LIMIT $1
    `, [Math.min(Math.max(Number(limit) || 20, 1), 100)]);
    return rows;
  },
};
