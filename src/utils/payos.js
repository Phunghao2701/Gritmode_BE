import { createHmac, randomInt } from "node:crypto";
import axios from "axios";
import { AppError } from "../errors/app-error.js";

const getPayOSRequestTimeoutMs = () => {
  const configured = Number(process.env.PAYOS_REQUEST_TIMEOUT_MS || 10000);
  if (!Number.isFinite(configured) || configured < 1000 || configured > 120000) {
    throw new AppError(503, "PAYOS_CONFIG_MISSING", "PAYOS_REQUEST_TIMEOUT_MS phải nằm trong khoảng 1000-120000ms");
  }
  return configured;
};

const appendOrderIdToRedirectUrl = (rawUrl, orderId) => {
  if (!orderId) return rawUrl;

  try {
    const url = new URL(rawUrl);
    url.searchParams.set("orderId", String(orderId));
    return url.toString();
  } catch {
    throw new AppError(503, "PAYOS_CONFIG_MISSING", "PAYOS_RETURN_URL hoặc PAYOS_CANCEL_URL không hợp lệ");
  }
};

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
  const key = String(checksumKey || process.env.PAYOS_CHECKSUM_KEY || "").trim();
  if (!key) {
    throw new AppError(503, "PAYOS_CONFIG_MISSING", "Thiếu PAYOS_CHECKSUM_KEY");
  }
  return createHmac("sha256", key)
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
  orderId,
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
    throw new AppError(503, "PAYOS_CONFIG_MISSING", "Thiếu cấu hình PayOS bắt buộc");
  }

  if (!process.env.PAYOS_CANCEL_URL || !process.env.PAYOS_RETURN_URL) {
    throw new AppError(503, "PAYOS_CONFIG_MISSING", "Thiếu PAYOS_CANCEL_URL hoặc PAYOS_RETURN_URL");
  }

  const cleanDescription = (description || `ORDER${orderCode}`).slice(0, 25);
  const resolvedCancelUrl = appendOrderIdToRedirectUrl(
    cancelUrl || process.env.PAYOS_CANCEL_URL,
    orderId,
  );
  const resolvedReturnUrl = appendOrderIdToRedirectUrl(
    returnUrl || process.env.PAYOS_RETURN_URL,
    orderId,
  );
  const dataToSign = {
    amount: Number(amount),
    cancelUrl: resolvedCancelUrl,
    description: cleanDescription,
    orderCode: Number(orderCode),
    returnUrl: resolvedReturnUrl,
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
        timeout: getPayOSRequestTimeoutMs(),
      }
    );

    if (response.data?.code === "00" && response.data?.data) {
      return response.data.data;
    }
    throw new AppError(502, "PAYOS_PROVIDER_FAILED", "PayOS từ chối tạo payment link");
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, "PAYOS_PROVIDER_FAILED", "Không thể kết nối PayOS");
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
    throw new AppError(503, "PAYOS_CONFIG_MISSING", "Thiếu cấu hình PayOS bắt buộc");
  }

  try {
    const response = await axios.get(
      `https://api-merchant.payos.vn/v2/payment-requests/${orderCodeOrLinkId}`,
      {
        headers: {
          "x-client-id": clientId.trim(),
          "x-api-key": apiKey.trim(),
        },
        timeout: getPayOSRequestTimeoutMs(),
      }
    );

    if (response.data?.code === "00" && response.data?.data) {
      const data = response.data.data;

      // PayOS returns `paymentLinkId` when creating a link, but `id` when
      // reading the link status. Normalize both provider responses to the
      // same internal field so identity validation remains strict.
      return {
        ...data,
        paymentLinkId: data.paymentLinkId ?? data.id,
      };
    }
    throw new AppError(502, "PAYOS_PROVIDER_FAILED", "PayOS không trả về trạng thái hợp lệ");
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, "PAYOS_PROVIDER_FAILED", "Không thể truy vấn trạng thái PayOS");
  }
};
