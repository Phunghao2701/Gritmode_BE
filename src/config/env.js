const integer = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const getConfig = () => ({
  nodeEnv: process.env.NODE_ENV || "development",
  port: integer(process.env.PORT, 5000),
  postgresUrl: process.env.POSTGRES_URL,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "15m",
  refreshTtlMs: integer(process.env.COOKIE_REFRESH_MAX_AGE, 30 * 24 * 60 * 60 * 1000),
  googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.CLIENT_ID,
});

export const validateRuntimeConfig = (config = getConfig()) => {
  const missing = [
    ["POSTGRES_URL", config.postgresUrl],
    ["JWT_SECRET", config.jwtSecret],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Thiếu biến môi trường: ${missing.join(", ")}`);
  return config;
};
