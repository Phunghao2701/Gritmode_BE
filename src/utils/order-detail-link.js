import { createHmac, timingSafeEqual } from "node:crypto";

const ORDER_DETAIL_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

export const ORDER_DETAIL_LINK_TTL = ORDER_DETAIL_LINK_TTL_SECONDS;

const resolveSecret = ({ env = process.env, secret } = {}) => {
  const value = secret || env.ORDER_DETAIL_LINK_SECRET || env.JWT_SECRET;
  return String(value || "").trim();
};

const sign = (payload, secret) => createHmac("sha256", secret).update(payload).digest("base64url");

export const createOrderDetailToken = (order, { env = process.env, secret, now = Date.now() } = {}) => {
  const resolvedSecret = resolveSecret({ env, secret });
  if (!resolvedSecret) {
    throw new Error("Thiếu ORDER_DETAIL_LINK_SECRET hoặc JWT_SECRET");
  }

  const payload = Buffer.from(JSON.stringify({
    orderId: Number(order.order_id),
    orderCode: String(order.order_code),
    expiresAt: Math.floor(now / 1000) + ORDER_DETAIL_LINK_TTL_SECONDS,
  })).toString("base64url");

  return `${payload}.${sign(payload, resolvedSecret)}`;
};

export const verifyOrderDetailToken = (token, { env = process.env, secret, now = Date.now() } = {}) => {
  const resolvedSecret = resolveSecret({ env, secret });
  if (!resolvedSecret || typeof token !== "string") return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload, resolvedSecret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isInteger(parsed.orderId) || !parsed.orderCode || Number(parsed.expiresAt) < Math.floor(now / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
