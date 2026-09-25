import pool from "../config/database.js";
const runner = (client) => client || pool;

export const sessionRepository = {
  async create(data, client) {
    const { rows } = await runner(client).query(
      `INSERT INTO user_session (user_id,refresh_token_hash,user_agent,ip_address,expired_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING user_session_id,user_id,user_agent,ip_address,expired_at,created_at,revoked_at`,
      [data.userId, data.refreshTokenHash, data.userAgent || null, data.ipAddress || null, data.expiresAt],
    );
    return rows[0];
  },
  async findById(sessionId, client) {
    const { rows } = await runner(client).query(
      `SELECT user_session_id,user_id,user_agent,ip_address,expired_at,revoked_at,created_at,updated_at
       FROM user_session
       WHERE user_session_id = $1`,
      [Number(sessionId)],
    );
    return rows[0] || null;
  },
  async findActiveById(sessionId, client) {
    const { rows } = await runner(client).query(
      `SELECT user_session_id,user_id,expired_at FROM user_session
       WHERE user_session_id=$1 AND revoked_at IS NULL AND expired_at > NOW()`,
      [Number(sessionId)],
    );
    return rows[0] || null;
  },
  async findActiveByHash(hash, client) {
    const { rows } = await runner(client).query(
      `SELECT user_session_id,user_id,expired_at FROM user_session
       WHERE refresh_token_hash=$1 AND revoked_at IS NULL AND expired_at > NOW()`, [hash],
    );
    return rows[0] || null;
  },
  async revoke(sessionId, client) {
    await runner(client).query(`UPDATE user_session SET revoked_at=COALESCE(revoked_at,NOW()),updated_at=NOW() WHERE user_session_id=$1`, [sessionId]);
  },
  async revokeByHash(hash, client) {
    await runner(client).query(`UPDATE user_session SET revoked_at=COALESCE(revoked_at,NOW()),updated_at=NOW() WHERE refresh_token_hash=$1`, [hash]);
  },
  async listByUser(userId, client) {
    const { rows } = await runner(client).query(
      `SELECT user_session_id,user_agent,ip_address,expired_at,revoked_at,created_at FROM user_session WHERE user_id=$1 ORDER BY created_at DESC`, [userId],
    );
    return rows;
  },
  async revokeOwned(sessionId, userId, client) {
    const { rowCount } = await runner(client).query(
      `UPDATE user_session SET revoked_at=COALESCE(revoked_at,NOW()),updated_at=NOW() WHERE user_session_id=$1 AND user_id=$2 AND revoked_at IS NULL`, [sessionId, userId],
    );
    return rowCount > 0;
  },
  async revokeAllByUser(userId, client) {
    await runner(client).query(`UPDATE user_session SET revoked_at=COALESCE(revoked_at,NOW()),updated_at=NOW() WHERE user_id=$1`, [userId]);
  },
  async revokeAllByUserId(userId, client) {
    const { rowCount } = await runner(client).query(
      `UPDATE user_session SET revoked_at=COALESCE(revoked_at,NOW()),updated_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`,
      [userId],
    );
    return rowCount;
  },
  async revokeOthers(userId, currentSessionId, client) {
    if (!currentSessionId) {
      throw new Error("currentSessionId is required for revokeOthers");
    }
    await runner(client).query(
      `UPDATE user_session SET revoked_at=COALESCE(revoked_at,NOW()),updated_at=NOW() WHERE user_id=$1 AND user_session_id<>$2`,
      [userId, Number(currentSessionId)],
    );
  },
};
