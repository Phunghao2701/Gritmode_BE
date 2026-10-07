import pkg from "pg";

const { Pool } = pkg;

// Có thể override SSL vì một số PostgreSQL pooler/dev tunnel không hỗ trợ SSL
// dù hostname không phải localhost.
const sslOverride = String(process.env.POSTGRES_SSL || "").trim().toLowerCase();
const isLocal = process.env.POSTGRES_URL && (process.env.POSTGRES_URL.includes("localhost") || process.env.POSTGRES_URL.includes("127.0.0.1"));
const useSsl = sslOverride === "false" || sslOverride === "0" || sslOverride === "disable"
  ? false
  : sslOverride === "true" || sslOverride === "1"
  ? { rejectUnauthorized: false }
  : !isLocal
  ? { rejectUnauthorized: false }
  : false;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,

  // Nếu không cấu hình, giữ mặc định: local tắt SSL, môi trường khác bật SSL.
  ssl: useSsl,

  // Pool config
  max: 20, // Số lượng kết nối tối đa trong pool
  idleTimeoutMillis: 30000, // Đóng các kết nối không dùng sau 30 giây
  connectionTimeoutMillis: 10000, // Timeout kết nối
});

export const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export default pool;
