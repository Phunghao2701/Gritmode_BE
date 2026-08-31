import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateBody, validateQuery, validateParam } from "../middlewares/validate.middleware.js";
import {
  validatePositiveId,
  validateAdminOrderQuery,
  validateCancelOrder,
} from "../utils/validation.js";
import {
  getOrders,
  getOrderById,
  confirmOrder,
  processOrder,
  shipOrder,
  completeOrder,
  cancelOrder,
} from "../controllers/admin-order.controller.js";

const router = Router();

// Guard all admin order routes with requireAuth & requireRole('admin')
router.use(requireAuth, requireRole("admin"));

/**
 * @swagger
 * tags:
 *   name: Admin Orders
 *   description: Admin Order Lifecycle Management APIs
 */

/**
 * @swagger
 * /admin/orders:
 *   get:
 *     summary: Lấy danh sách toàn bộ đơn hàng (Admin)
 *     tags:
 *       - Admin Orders
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
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo mã đơn hàng, email, hoặc số điện thoại
 *       - in: query
 *         name: status_order
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, processing, shipping, completed, cancelled]
 *       - in: query
 *         name: status_payment
 *         schema:
 *           type: string
 *           enum: [pending, paid, failed, refunded, cancelled]
 *       - in: query
 *         name: payment_method
 *         schema:
 *           type: string
 *           enum: [cod, payos]
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [created_at, updated_at, total_order]
 *           default: created_at
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Danh sách đơn hàng
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get(
  "/orders",
  validateQuery(validateAdminOrderQuery),
  getOrders,
);

/**
 * @swagger
 * /admin/orders/{orderId}:
 *   get:
 *     summary: Lấy chi tiết đơn hàng (Admin)
 *     tags:
 *       - Admin Orders
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
 *         description: Chi tiết đơn hàng
 *       404:
 *         description: Không tìm thấy đơn hàng
 */
router.get(
  "/orders/:orderId",
  validateParam("orderId", validatePositiveId),
  getOrderById,
);

/**
 * @swagger
 * /admin/orders/{orderId}/confirm:
 *   patch:
 *     summary: Xác nhận đơn hàng (pending -> confirmed)
 *     tags:
 *       - Admin Orders
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
 *         description: Xác nhận đơn hàng thành công
 *       409:
 *         description: Trạng thái không hợp lệ
 */
router.patch(
  "/orders/:orderId/confirm",
  validateParam("orderId", validatePositiveId),
  confirmOrder,
);

/**
 * @swagger
 * /admin/orders/{orderId}/processing:
 *   patch:
 *     summary: Chuyển đơn hàng sang chuẩn bị hàng (confirmed -> processing)
 *     tags:
 *       - Admin Orders
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
 *         description: Chuyển trạng thái thành công
 *       409:
 *         description: Trạng thái không hợp lệ
 */
router.patch(
  "/orders/:orderId/processing",
  validateParam("orderId", validatePositiveId),
  processOrder,
);

/**
 * @swagger
 * /admin/orders/{orderId}/shipping:
 *   patch:
 *     summary: Chuyển đơn hàng sang giao hàng (processing -> shipping)
 *     tags:
 *       - Admin Orders
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
 *         description: Chuyển trạng thái thành công
 *       409:
 *         description: Trạng thái không hợp lệ
 */
router.patch(
  "/orders/:orderId/shipping",
  validateParam("orderId", validatePositiveId),
  shipOrder,
);

/**
 * @swagger
 * /admin/orders/{orderId}/complete:
 *   patch:
 *     summary: Hoàn thành đơn hàng (shipping -> completed)
 *     tags:
 *       - Admin Orders
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
 *         description: Hoàn thành đơn hàng thành công
 *       409:
 *         description: Trạng thái không hợp lệ
 */
router.patch(
  "/orders/:orderId/complete",
  validateParam("orderId", validatePositiveId),
  completeOrder,
);

/**
 * @swagger
 * /admin/orders/{orderId}/cancel:
 *   patch:
 *     summary: Hủy đơn hàng (pending / confirmed / processing -> cancelled)
 *     tags:
 *       - Admin Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Hủy đơn hàng thành công
 *       409:
 *         description: Trạng thái không hợp lệ
 */
router.patch(
  "/orders/:orderId/cancel",
  validateParam("orderId", validatePositiveId),
  validateBody(validateCancelOrder),
  cancelOrder,
);

export default router;
