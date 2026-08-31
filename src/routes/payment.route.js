import { Router } from "express";
import { optionalAuth, requireAuth } from "../middlewares/auth.middleware.js";
import { validateBody, validateParam } from "../middlewares/validate.middleware.js";
import {
  validatePositiveId,
  validateCreatePayOSPayment,
  validatePayOSWebhook,
} from "../utils/validation.js";
import {
  createPayOSPayment,
  handlePayOSWebhook,
  getOrderPayment,
  cancelPayOSPayment,
} from "../controllers/payment.controller.js";

export const paymentRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: payOS Online Payment & VietQR APIs
 */

/**
 * @swagger
 * /payments/payos:
 *   post:
 *     summary: Tạo / Tạo lại payOS Payment Link cho đơn hàng (User / Guest)
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_id
 *             properties:
 *               order_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Tạo link thanh toán payOS thành công
 *       404:
 *         description: Không tìm thấy đơn hàng
 *       409:
 *         description: Đơn hàng không thể thanh toán hoặc đã được thanh toán
 */
paymentRouter.post(
  "/payos",
  optionalAuth,
  validateBody(validateCreatePayOSPayment),
  createPayOSPayment,
);

/**
 * @swagger
 * /payments/payos/webhook:
 *   post:
 *     summary: Nhận Webhook xác nhận thanh toán từ payOS
 *     tags:
 *       - Payments
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - data
 *               - signature
 *             properties:
 *               code:
 *                 type: string
 *               data:
 *                 type: object
 *               signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Xử lý webhook thành công
 *       400:
 *         description: Chữ ký không hợp lệ hoặc sai số tiền
 */
paymentRouter.post(
  "/payos/webhook",
  validateBody(validatePayOSWebhook),
  handlePayOSWebhook,
);

export default paymentRouter;
