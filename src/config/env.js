const integer = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const getConfig = () => ({
  nodeEnv: process.env.NODE_ENV || "development",
  port: integer(process.env.PORT, 5000),
  postgresUrl: process.env.POSTGRES_URL,
  frontendUrl: process.env.FRONTEND_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "15m",
  refreshTtlMs: integer(process.env.COOKIE_REFRESH_MAX_AGE, 30 * 24 * 60 * 60 * 1000),
  googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.CLIENT_ID,
  emailProvider: process.env.EMAIL_PROVIDER,
  redisUrl: process.env.REDIS_URL,
  payosClientId: process.env.PAYOS_CLIENT_ID,
  payosApiKey: process.env.PAYOS_API_KEY,
  payosChecksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

export const validateRuntimeConfig = (config = getConfig()) => {
  const missing = [
    ["POSTGRES_URL", config.postgresUrl],
    ["JWT_SECRET", config.jwtSecret],
    ["FRONTEND_URL", config.frontendUrl],
    ["REDIS_URL", config.redisUrl],
    ["EMAIL_PROVIDER", config.emailProvider],
    ["PAYOS_CLIENT_ID", config.payosClientId],
    ["PAYOS_API_KEY", config.payosApiKey],
    ["PAYOS_CHECKSUM_KEY", config.payosChecksumKey],
  ].filter(([, value]) => !String(value || "").trim()).map(([name]) => name);
  if (missing.length) throw new Error(`Thiếu biến môi trường: ${missing.join(", ")}`);

  const provider = String(config.emailProvider).trim().toLowerCase();
  if (!["resend", "smtp", "brevo", "gmail"].includes(provider)) {
    throw new Error(`EMAIL_PROVIDER không được hỗ trợ: ${config.emailProvider}`);
  }

  if (provider === "resend" && !String(process.env.RESEND_API_KEY || "").trim()) {
    throw new Error("Thiếu biến môi trường: RESEND_API_KEY");
  }

  if (provider === "smtp" && (!String(process.env.EMAIL_USER || "").trim()
    || !String(process.env.EMAIL_PASS || process.env.EMAIL_APP_PASSWORD || "").trim())) {
    throw new Error("SMTP cần EMAIL_USER và EMAIL_PASS");
  }

  return config;
};
