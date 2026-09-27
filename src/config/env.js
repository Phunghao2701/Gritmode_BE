const integer = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Biến môi trường ${fieldName} phải là số nguyên dương hợp lệ, nhận được: ${value}`);
  }
  return parsed;
};

export const getConfig = () => ({
  nodeEnv: process.env.NODE_ENV,
  port: integer(process.env.PORT, "PORT"),
  postgresUrl: process.env.POSTGRES_URL,
  redisUrl: process.env.REDIS_URL,
  frontendUrl: process.env.FRONTEND_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,
  refreshTtlMs: integer(process.env.COOKIE_REFRESH_MAX_AGE, "COOKIE_REFRESH_MAX_AGE"),
  googleClientId: process.env.CLIENT_ID,
  minioEndpoint: process.env.MINIO_ENDPOINT,
  minioPort: integer(process.env.MINIO_PORT, "MINIO_PORT"),
  minioUseSsl: process.env.MINIO_USE_SSL === "true",
  minioAccessKey: process.env.MINIO_ACCESS_KEY,
  minioSecretKey: process.env.MINIO_SECRET_KEY,
  minioBucket: process.env.MINIO_BUCKET,
  minioPublicUrl: process.env.MINIO_PUBLIC_URL,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: integer(process.env.SMTP_PORT, "SMTP_PORT"),
});

export const validateRuntimeConfig = (config = getConfig()) => {
  const required = [
    ["PORT", config.port],
    ["NODE_ENV", config.nodeEnv],
    ["POSTGRES_URL", config.postgresUrl],
    ["REDIS_URL", config.redisUrl],
    ["JWT_SECRET", config.jwtSecret],
    ["JWT_EXPIRES_IN", config.jwtExpiresIn],
    ["COOKIE_REFRESH_MAX_AGE", config.refreshTtlMs],
    ["FRONTEND_URL", config.frontendUrl],
    ["MINIO_ENDPOINT", config.minioEndpoint],
    ["MINIO_PORT", config.minioPort],
    ["MINIO_ACCESS_KEY", config.minioAccessKey],
    ["MINIO_SECRET_KEY", config.minioSecretKey],
    ["MINIO_BUCKET", config.minioBucket],
    ["MINIO_PUBLIC_URL", config.minioPublicUrl],
  ];

  const missing = required
    .filter(([, value]) => value === undefined || value === null || value === "")
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(`[Config Error] Thiếu biến môi trường bắt buộc: ${missing.join(", ")}`);
  }
  return config;
};
