import pool from "../config/database.js";

const runner = (client) => client || pool;

const projection = `
  email_otp_id,
  email,
  otp_hash,
  attempt_count,
  expired_at,
  verified_at,
  created_at
`;

export const emailOtpRepository = {
  async create({ email, otpHash, expiredAt }, client) {
    const query = `
      INSERT INTO email_otp (email, otp_hash, attempt_count, expired_at, created_at)
      VALUES ($1, $2, 0, $3, NOW())
      RETURNING ${projection}
    `;
    const { rows } = await runner(client).query(query, [
      email.trim().toLowerCase(),
      otpHash,
      expiredAt,
    ]);
    return rows[0];
  },

  async findLatestByEmail(email, client) {
    const query = `
      SELECT ${projection}
      FROM email_otp
      WHERE email = $1 AND verified_at IS NULL
      ORDER BY created_at DESC, email_otp_id DESC
      LIMIT 1
    `;
    const { rows } = await runner(client).query(query, [email.trim().toLowerCase()]);
    return rows[0] || null;
  },

  async findRecentByEmail(email, seconds = 60, client) {
    const query = `
      SELECT ${projection}
      FROM email_otp
      WHERE email = $1
        AND created_at >= NOW() - ($2 || ' seconds')::interval
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const { rows } = await runner(client).query(query, [email.trim().toLowerCase(), String(seconds)]);
    return rows[0] || null;
  },

  async incrementAttempt(emailOtpId, client) {
    const query = `
      UPDATE email_otp
      SET attempt_count = attempt_count + 1
      WHERE email_otp_id = $1
      RETURNING ${projection}
    `;
    const { rows } = await runner(client).query(query, [emailOtpId]);
    return rows[0] || null;
  },

  async markVerified(emailOtpId, client) {
    const query = `
      UPDATE email_otp
      SET verified_at = NOW()
      WHERE email_otp_id = $1
      RETURNING ${projection}
    `;
    const { rows } = await runner(client).query(query, [emailOtpId]);
    return rows[0] || null;
  },
};
