import { createHmac, randomInt } from "node:crypto";
import axios from "axios";

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

/**
 * Call payOS API to create real Payment Link & VietQR code
 */
export const callPayOSCreatePaymentLink = async ({
  orderCode,
  amount,
  description,
  cancelUrl,
  returnUrl,
  items = [],
}) => {
  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;

  if (
    !clientId ||
    !apiKey ||
    !checksumKey ||
    clientId.includes("<") ||
    apiKey.includes("<") ||
    checksumKey.includes("<")
  ) {
    console.warn("payOS keys are not configured yet in .env");
    return null;
  }

  const cleanDescription = (description || `ORDER${orderCode}`).slice(0, 25);
  const dataToSign = {
    amount: Number(amount),
    cancelUrl: cancelUrl || process.env.PAYOS_CANCEL_URL || "http://localhost:5173/checkout",
    description: cleanDescription,
    orderCode: Number(orderCode),
    returnUrl: returnUrl || process.env.PAYOS_RETURN_URL || "http://localhost:5173/payment/result",
  };

  const signature = createPayOSSignature(dataToSign, checksumKey);

  const payload = {
    ...dataToSign,
    items,
    signature,
  };

  try {
    const response = await axios.post(
      "https://api-merchant.payos.vn/v2/payment-requests",
      payload,
      {
        headers: {
          "x-client-id": clientId.trim(),
          "x-api-key": apiKey.trim(),
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data?.code === "00" && response.data?.data) {
      return response.data.data;
    }
    console.warn("payOS API responded with code:", response.data?.code, response.data?.desc);
    return null;
  } catch (err) {
    console.error("payOS API request error:", err.response?.data || err.message);
    return null;
  }
};

/**
 * Call payOS API to check payment link status
 */
export const getPayOSPaymentLinkInfo = async (orderCodeOrLinkId) => {
  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;

  if (
    !clientId ||
    !apiKey ||
    clientId.includes("<") ||
    apiKey.includes("<")
  ) {
    return null;
  }

  try {
    const response = await axios.get(
      `https://api-merchant.payos.vn/v2/payment-requests/${orderCodeOrLinkId}`,
      {
        headers: {
          "x-client-id": clientId.trim(),
          "x-api-key": apiKey.trim(),
        },
      }
    );

    if (response.data?.code === "00" && response.data?.data) {
      return response.data.data;
    }
    return null;
  } catch (err) {
    return null;
  }
};
