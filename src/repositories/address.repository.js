import pool from "../config/database.js";

const runner = (client) => client || pool;
const columns = `user_address_id, user_id, receiver_name_user_address, phone_user_address,
  address_line_user_address, ward_user_address, district_user_address, province_user_address,
  is_default, created_at, updated_at`;

const fieldMap = {
  receiver_name: "receiver_name_user_address",
  receiver_name_user_address: "receiver_name_user_address",
  phone: "phone_user_address",
  phone_user_address: "phone_user_address",
  address_line: "address_line_user_address",
  address_line_user_address: "address_line_user_address",
  ward: "ward_user_address",
  ward_user_address: "ward_user_address",
  district: "district_user_address",
  district_user_address: "district_user_address",
  province: "province_user_address",
  province_user_address: "province_user_address",
  is_default: "is_default",
};

export const addressRepository = {
  async list(userId, client) {
    const { rows } = await runner(client).query(
      `SELECT ${columns} FROM user_address WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId],
    );
    return rows;
  },

  async findById(addressId, userId, client) {
    const { rows } = await runner(client).query(
      `SELECT ${columns} FROM user_address WHERE user_address_id = $1 AND user_id = $2`,
      [addressId, userId],
    );
    return rows[0] || null;
  },

  async countByUser(userId, client) {
    const { rows } = await runner(client).query(
      `SELECT COUNT(*)::int AS count FROM user_address WHERE user_id = $1`,
      [userId],
    );
    return Number(rows[0]?.count) || 0;
  },

  async findNewest(userId, client) {
    const { rows } = await runner(client).query(
      `SELECT ${columns} FROM user_address WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    return rows[0] || null;
  },

  async create(userId, input, client) {
    const receiverName = input.receiver_name ?? input.receiver_name_user_address;
    const phone = input.phone ?? input.phone_user_address;
    const addressLine = input.address_line ?? input.address_line_user_address;
    const ward = input.ward ?? input.ward_user_address ?? null;
    const district = input.district ?? input.district_user_address ?? null;
    const province = input.province ?? input.province_user_address ?? null;
    const isDefault = Boolean(input.is_default);

    const { rows } = await runner(client).query(
      `INSERT INTO user_address (
        user_id, receiver_name_user_address, phone_user_address, address_line_user_address,
        ward_user_address, district_user_address, province_user_address, is_default, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING ${columns}`,
      [userId, receiverName, phone, addressLine, ward, district, province, isDefault],
    );
    return rows[0];
  },

  async update(addressId, userId, input, client) {
    const updates = [];
    const values = [addressId, userId];
    const seenColumns = new Set();

    for (const [key, col] of Object.entries(fieldMap)) {
      if (input[key] !== undefined && !seenColumns.has(col)) {
        seenColumns.add(col);
        values.push(input[key]);
        updates.push(`${col} = $${values.length}`);
      }
    }

    if (!updates.length) {
      return this.findById(addressId, userId, client);
    }

    updates.push("updated_at = NOW()");

    const { rows } = await runner(client).query(
      `UPDATE user_address SET ${updates.join(", ")} WHERE user_address_id = $1 AND user_id = $2 RETURNING ${columns}`,
      values,
    );
    return rows[0] || null;
  },

  async remove(addressId, userId, client) {
    const { rowCount } = await runner(client).query(
      `DELETE FROM user_address WHERE user_address_id = $1 AND user_id = $2`,
      [addressId, userId],
    );
    return rowCount > 0;
  },

  async unsetDefault(userId, client) {
    await runner(client).query(
      `UPDATE user_address SET is_default = false, updated_at = NOW() WHERE user_id = $1 AND is_default = true`,
      [userId],
    );
  },

  async setDefault(addressId, userId, client) {
    const db = runner(client);
    const found = await db.query(
      `SELECT 1 FROM user_address WHERE user_address_id = $1 AND user_id = $2 FOR UPDATE`,
      [addressId, userId],
    );
    if (!found.rowCount) return null;

    await db.query(
      `UPDATE user_address SET is_default = false, updated_at = NOW() WHERE user_id = $1 AND is_default = true`,
      [userId],
    );

    const { rows } = await db.query(
      `UPDATE user_address SET is_default = true, updated_at = NOW() WHERE user_address_id = $1 AND user_id = $2 RETURNING ${columns}`,
      [addressId, userId],
    );
    return rows[0] || null;
  },
};
