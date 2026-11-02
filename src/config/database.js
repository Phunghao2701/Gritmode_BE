import pkg from "pg";

const { Pool } = pkg;

// SSL is enabled for remote PostgreSQL. Certificate verification stays on by
// default, but can be disabled explicitly for providers with self-signed
// certificate chains via POSTGRES_SSL_REJECT_UNAUTHORIZED=false.
const sslOverride = String(process.env.POSTGRES_SSL || "").trim().toLowerCase();
const sslVerificationOverride = String(process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED || "").trim().toLowerCase();
const isLocal = process.env.POSTGRES_URL && (process.env.POSTGRES_URL.includes("localhost") || process.env.POSTGRES_URL.includes("127.0.0.1"));
const sslOptions = {
  rejectUnauthorized: !["false", "0", "no"].includes(sslVerificationOverride),
  ...(process.env.POSTGRES_CA ? { ca: process.env.POSTGRES_CA } : {}),
};
const useSsl = sslOverride === "false" || sslOverride === "0" || sslOverride === "disable"
  ? false
  : sslOverride === "true" || sslOverride === "1"
  ? sslOptions
  : !isLocal
  ? sslOptions
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
