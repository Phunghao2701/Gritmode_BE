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
  async findActiveByHashWithUser(hash, client) {
    const { rows } = await runner(client).query(
      `SELECT s.user_session_id, s.user_id, s.expired_at,
              u.email, u.status, u.role, u.full_name, u.phone, u.url_image,
              u.date_of_birth, u.gender, u.email_verified_at, u.created_at, u.updated_at
       FROM user_session s
       JOIN "user" u ON u.user_id = s.user_id
       WHERE s.refresh_token_hash=$1 AND s.revoked_at IS NULL AND s.expired_at > NOW()`,
      [hash],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      session: {
        user_session_id: r.user_session_id,
        user_id: r.user_id,
        expired_at: r.expired_at,
      },
      user: {
        user_id: r.user_id,
        email: r.email,
        status: r.status,
        role: r.role,
        full_name: r.full_name,
        phone: r.phone,
        url_image: r.url_image,
        date_of_birth: r.date_of_birth,
        gender: r.gender,
        email_verified_at: r.email_verified_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
    };
  },
  async rotate(sessionId, newHash, newExpiresAt, userAgent, ipAddress, client) {
    const { rows } = await runner(client).query(
      `UPDATE user_session
       SET refresh_token_hash=$2, expired_at=$3,
           user_agent=COALESCE($4, user_agent), ip_address=COALESCE($5, ip_address),
           updated_at=NOW()
       WHERE user_session_id=$1 AND revoked_at IS NULL
       RETURNING user_session_id, user_id, user_agent, ip_address, expired_at, created_at, revoked_at`,
      [sessionId, newHash, newExpiresAt, userAgent || null, ipAddress || null],
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
