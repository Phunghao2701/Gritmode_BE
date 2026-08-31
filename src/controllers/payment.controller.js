import { ok, created } from "../utils/api-response.js";
import * as paymentService from "../services/payment.service.js";
import logger from "../utils/logger.js";

export const createPaymentController = ({
  payments = paymentService,
} = {}) => ({
  /**
   * POST /api/v1/payments/payos
   */
  createPayOSPayment: async (req, res, next) => {
    try {
      const payload = req.validatedBody || req.body || {};
      const result = await payments.createPayOSPayment({
        orderId: payload.order_id,
        user: req.user || null,
        guestInfo: {
          guest_token: req.headers["x-guest-token"] || payload.guest_token,
          email: payload.email,
          phone: payload.phone,
        },
      });
      return created(res, result, { message: "Tạo link thanh toán payOS thành công" });
    } catch (error) {
      logger.error("[payment] createPayOSPayment error:", error);
      next(error);
    }
  },

  /**
   * POST /api/v1/payments/payos/webhook
   */
  handlePayOSWebhook: async (req, res, next) => {
    try {
      const payload = req.validatedBody || req.body || {};
      const result = await payments.handlePayOSWebhook(payload);
      return ok(res, result, { message: "Xử lý webhook payOS thành công" });
    } catch (error) {
      logger.error("[payment] handlePayOSWebhook error:", error);
      next(error);
    }
  },

  /**
   * GET /api/v1/orders/:orderId/payment
   */
  getOrderPayment: async (req, res, next) => {
    try {
      const orderId = req.validatedParams ? req.validatedParams.orderId : req.params.orderId;
      const result = await payments.getOrderPaymentStatus(orderId, req.user || null);
      return ok(res, result, { message: "Lấy trạng thái thanh toán thành công" });
    } catch (error) {
      logger.error("[payment] getOrderPayment error:", error);
      next(error);
    }
  },

  /**
   * POST /api/v1/orders/:orderId/payment/cancel
   */
  cancelPayOSPayment: async (req, res, next) => {
    try {
      const orderId = req.validatedParams ? req.validatedParams.orderId : req.params.orderId;
      const result = await payments.cancelPayOSPaymentLink(orderId, req.user || null);
      return ok(res, result, { message: "Hủy link thanh toán thành công" });
    } catch (error) {
      logger.error("[payment] cancelPayOSPayment error:", error);
      next(error);
    }
  },
});

const defaultPaymentController = createPaymentController();
export const {
  createPayOSPayment,
  handlePayOSWebhook,
  getOrderPayment,
  cancelPayOSPayment,
} = defaultPaymentController;
