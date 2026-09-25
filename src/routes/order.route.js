import { Router } from "express";
import { optionalAuth, requireAuth } from "../middlewares/auth.middleware.js";
import { resolveCartOwner } from "../middlewares/cart.middleware.js";
import { validateBody, validateQuery, validateParam } from "../middlewares/validate.middleware.js";
import {
  validateCheckout,
  validatePositiveId,
  validateUserOrderQuery,
  validateGuestOrderLookup,
  validateGuestOrderCancel,
} from "../utils/validation.js";
import {
  createOrder,
  getMyOrders,
  getMyOrderById,
  cancelMyOrder,
  lookupGuestOrder,
  cancelGuestOrder,
} from "../controllers/order.controller.js";
import {
  getOrderPayment,
  cancelPayOSPayment,
} from "../controllers/payment.controller.js";

const router = Router();

/**
 * Custom validation middleware for Checkout that knows authentication state
 */
const validateCheckoutMiddleware = (req, res, next) => {
  const isAuthenticated = Boolean(req.user?.user_id);
  const result = validateCheckout(req.body, { isAuthenticated });
  if (!result.ok) {
    const firstMessage = result.errors?.[0]?.message || "Dữ liệu không hợp lệ";
    const error = new Error(firstMessage);
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    error.message = firstMessage;
    error.details = result.errors;
    error.errors = result.errors;
    error.isOperational = true;
    return next(error);
  }
  req.validatedBody = result.value;
  next();
};

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Order Management and Checkout APIs
 */

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Checkout giỏ hàng và tạo đơn hàng (Hỗ trợ Guest & Authenticated User)
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: header
 *         name: X-Guest-Token
 *         required: false
 *         schema:
 *           type: string
 *         description: Guest token sở hữu giỏ hàng của khách
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - payment_method
 *             properties:
 *               payment_method:
 *                 type: string
 *                 enum: [cod, payos]
 *                 example: cod
 *               voucher_code:
 *                 type: string
 *                 example: SUMMER10
 *               note_order:
 *                 type: string
 *                 example: Giao giờ hành chính
 *               user_address_id:
 *                 type: integer
 *                 description: ID địa chỉ nhận hàng đã lưu của user (Dành cho User đã đăng nhập)
 *               guest_token:
 *                 type: string
 *                 description: Token nhận diện guest cart (Nếu không truyền header X-Guest-Token)
 *               email_order:
 *                 type: string
 *                 format: email
 *                 example: guest@gmail.com
 *               phone_order:
 *                 type: string
 *                 example: "0901234567"
 *               receiver_name_order_address:
 *                 type: string
 *                 example: Nguyen Van A
 *               phone_order_address:
 *                 type: string
 *                 example: "0901234567"
 *               address_line_order_address:
 *                 type: string
 *                 example: 123 Nguyen Trai
 *               ward_order_address:
 *                 type: string
 *                 example: Ben Thanh
 *               district_order_address:
 *                 type: string
 *                 example: District 1
 *               province_order_address:
 *                 type: string
 *                 example: Ho Chi Minh City
 *     responses:
 *       201:
 *         description: Đặt hàng thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc giỏ hàng rỗng
 *       404:
 *         description: Không tìm thấy giỏ hàng hoặc sản phẩm
 *       409:
 *         description: Tồn kho không đủ cho các sản phẩm trong giỏ hàng
 */
router.post(
  "/",
  optionalAuth,
  resolveCartOwner({ allowMissingGuest: true }),
  validateCheckoutMiddleware,
  createOrder,
);

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Lấy danh sách đơn hàng của người dùng hiện tại
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: status_order
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, processing, shipping, completed, cancelled]
 *     responses:
 *       200:
 *         description: Lấy danh sách đơn hàng thành công
 *       401:
 *         description: Chưa đăng nhập
 */
router.get(
  "/",
  requireAuth,
  validateQuery(validateUserOrderQuery),
  getMyOrders,
);

/**
 * @swagger
 * /orders/guest/lookup:
 *   post:
 *     summary: Khách vãng lai tra cứu đơn hàng bằng thông tin xác minh (order_code, email, phone)
 *     tags:
 *       - Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_code
 *               - email
 *               - phone
 *             properties:
 *               order_code:
 *                 type: string
 *                 example: ORD-20260831-123456
 *               email:
 *                 type: string
 *                 format: email
 *                 example: guest@gmail.com
 *               phone:
 *                 type: string
 *                 example: "0901234567"
 *     responses:
 *       200:
 *         description: Tra cứu đơn hàng thành công
 *       400:
 *         description: Thông tin tra cứu không hợp lệ
 *       404:
 *         description: Không tìm thấy đơn hàng phù hợp
 */
router.post(
  "/guest/lookup",
  validateBody(validateGuestOrderLookup),
  lookupGuestOrder,
);

/**
 * @swagger
 * /orders/guest/{orderCode}/cancel:
 *   post:
 *     summary: Khách vãng lai hủy đơn hàng (khi đang ở trạng thái pending hoặc confirmed)
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: orderCode
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - phone
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Hủy đơn hàng thành công
 *       404:
 *         description: Không tìm thấy đơn hàng
 *       409:
 *         description: Đơn hàng không thể hủy ở trạng thái hiện tại
 */
router.post(
  "/guest/:orderCode/cancel",
  validateBody(validateGuestOrderCancel),
  cancelGuestOrder,
);

/**
 * @swagger
 * /orders/{orderId}:
 *   get:
 *     summary: Lấy chi tiết đơn hàng của người dùng hiện tại
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lấy chi tiết đơn hàng thành công
 *       401:
 *         description: Chưa đăng nhập
 *       404:
 *         description: Không tìm thấy đơn hàng
 */
router.get(
  "/:orderId",
  optionalAuth,
  validateParam("orderId", validatePositiveId),
  getMyOrderById,
);

/**
 * @swagger
 * /orders/{orderId}/cancel:
 *   patch:
 *     summary: Hủy đơn hàng của người dùng hiện tại (pending hoặc confirmed)
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Hủy đơn hàng thành công
 *       401:
 *         description: Chưa đăng nhập
 *       404:
 *         description: Không tìm thấy đơn hàng
 *       409:
 *         description: Đơn hàng không thể hủy ở trạng thái hiện tại
 */
router.patch(
  "/:orderId/cancel",
  requireAuth,
  validateParam("orderId", validatePositiveId),
  cancelMyOrder,
);

/**
 * @swagger
 * /orders/{orderId}/payment:
 *   get:
 *     summary: Lấy thông tin thanh toán của đơn hàng (Polling)
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lấy thông tin thanh toán thành công
 *       404:
 *         description: Không tìm thấy đơn hàng
 */
router.get(
  "/:orderId/payment",
  optionalAuth,
  validateParam("orderId", validatePositiveId),
  getOrderPayment,
);

/**
 * @swagger
 * /orders/{orderId}/payment/cancel:
 *   post:
 *     summary: Hủy link thanh toán payOS đang chờ thanh toán
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Hủy link thanh toán thành công
 *       409:
 *         description: Không thể hủy link thanh toán ở trạng thái hiện tại
 */
router.post(
  "/:orderId/payment/cancel",
  optionalAuth,
  validateParam("orderId", validatePositiveId),
  cancelPayOSPayment,
);

export default router;

