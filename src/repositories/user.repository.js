import pool from "../config/database.js";

const runner = (client) => client || pool;
const projection = `user_id, email, status, role, full_name, url_image,
  date_of_birth, gender, phone, email_verified_at, created_at, updated_at`;


export const userRepository = {
  async findByEmail(email, client) {
    const { rows } = await runner(client).query(`SELECT ${projection} FROM "user" WHERE email = $1`, [email]);
    return rows[0] || null;
  },
  async findByPhone(phone, client) {
    const { rows } = await runner(client).query(`SELECT ${projection} FROM "user" WHERE phone = $1`, [phone]);
    return rows[0] || null;
  },
  async findById(userId, client) {
    const { rows } = await runner(client).query(`SELECT ${projection} FROM "user" WHERE user_id = $1`, [userId]);
    return rows[0] || null;
  },
  async createFromOtp({ email, fullName = null, role = "customer", status = "active" }, client) {
    const { rows } = await runner(client).query(
      `INSERT INTO "user" (user_id,email,status,role,full_name,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,NOW(),NOW(),NOW()) RETURNING ${projection}`,
      [email.trim().toLowerCase(), status, role, fullName],
    );
    return rows[0];
  },
  async updateProfile(userId, fields, client) {
    const allowed = { full_name: "full_name", url_image: "url_image", date_of_birth: "date_of_birth", gender: "gender", phone: "phone" };
    const entries = Object.entries(fields).filter(([key]) => allowed[key] && fields[key] !== undefined);
    if (!entries.length) return this.findById(userId, client);
    const sets = entries.map(([key], index) => `${allowed[key]} = $${index + 2}`).join(", ");
    const { rows } = await runner(client).query(
      `UPDATE "user" SET ${sets} WHERE user_id = $1 RETURNING ${projection}`,
      [userId, ...entries.map(([, value]) => value)],
    );
    return rows[0] || null;
  },
  async findAdminUsers({ page = 1, limit = 20, search, role, status, sortBy = "created_at", sortOrder = "DESC" }, client) {
    const conditions = [];
    const values = [];
    let idx = 1;

    if (search) {
      conditions.push(`(email ILIKE $${idx} OR full_name ILIKE $${idx} OR phone ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    if (role) {
      conditions.push(`role = $${idx}`);
      values.push(role);
      idx++;
    }

    if (status) {
      conditions.push(`status = $${idx}`);
      values.push(status);
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const allowedSort = {
      created_at: "created_at",
      updated_at: "updated_at",
      email: "email",
      full_name: "full_name",
    };
    const sortCol = allowedSort[sortBy] || "created_at";
    const direction = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const offset = (page - 1) * limit;
    values.push(limit, offset);
    const limitIdx = idx;
    const offsetIdx = idx + 1;

    const query = `
      SELECT ${projection}
      FROM "user"
      ${whereClause}
      ORDER BY ${sortCol} ${direction}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const { rows } = await runner(client).query(query, values);
    return rows;
  },

  async countAdminUsers({ search, role, status }, client) {
    const conditions = [];
    const values = [];
    let idx = 1;

    if (search) {
      conditions.push(`(email ILIKE $${idx} OR full_name ILIKE $${idx} OR phone ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    if (role) {
      conditions.push(`role = $${idx}`);
      values.push(role);
      idx++;
    }

    if (status) {
      conditions.push(`status = $${idx}`);
      values.push(status);
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `SELECT COUNT(*)::int AS total FROM "user" ${whereClause}`;
    const { rows } = await runner(client).query(query, values);
    return rows[0]?.total || 0;
  },

  async lockUserById(userId, client) {
    const { rows } = await runner(client).query(
      `SELECT ${projection} FROM "user" WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    return rows[0] || null;
  },

  async updateUserStatus(userId, status, client) {
    const { rows } = await runner(client).query(
      `UPDATE "user" SET status = $2, updated_at = NOW() WHERE user_id = $1 RETURNING ${projection}`,
      [userId, status],
    );
    return rows[0] || null;
  },

  async countActiveAdmins(client) {
    const { rows } = await runner(client).query(
      `SELECT COUNT(*)::int AS count FROM "user" WHERE role = 'admin' AND status = 'active'`,
    );
    return rows[0]?.count || 0;
  },
};
