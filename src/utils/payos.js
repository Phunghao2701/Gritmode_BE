import { createHmac, randomInt } from "node:crypto";

/**
 * Generate numeric unique orderCode for payOS
 */
export const generatePayOSOrderCode = () => {
  const timeSlice = Date.now().toString().slice(-6);
  const rand = randomInt(100, 999);
  return Number(`${timeSlice}${rand}`);
};

/**
 * Sort object keys alphabetically and build query string format for payOS hashing
 */
export const sortDataByKey = (data = {}) => {
  const sorted = {};
  const keys = Object.keys(data).sort();
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null) {
      sorted[key] = data[key];
    }
  }
  return Object.keys(sorted)
    .map((k) => `${k}=${sorted[k]}`)
    .join("&");
};

/**
 * Create payOS HMAC-SHA256 signature
 */
export const createPayOSSignature = (data = {}, checksumKey = "") => {
  const queryString = sortDataByKey(data);
  return createHmac("sha256", checksumKey || process.env.PAYOS_CHECKSUM_KEY || "")
    .update(queryString)
    .digest("hex");
};

/**
 * Verify payOS Webhook signature
 */
export const verifyPayOSWebhookSignature = (webhookBody = {}, checksumKey = "") => {
  if (!webhookBody || !webhookBody.data || !webhookBody.signature) {
    return false;
  }

  const expectedSignature = createPayOSSignature(webhookBody.data, checksumKey);
  return expectedSignature.toLowerCase() === String(webhookBody.signature).toLowerCase();
};
