import { Router } from "express";
import {
  validateVoucher,
  getVouchers,
  getVoucherById,
  createVoucher,
  updateVoucher,
  updateVoucherStatus,
  deleteVoucher,
} from "../controllers/voucher.controller.js";
import { requireAuth, requireRole, optionalAuth } from "../middlewares/auth.middleware.js";
import { resolveCartOwner } from "../middlewares/cart.middleware.js";
import { validateBody, validateQuery, validateParam } from "../middlewares/validate.middleware.js";
import {
  validateVoucherApplication,
  validateCreateVoucher,
  validateUpdateVoucher,
  validateUpdateVoucherStatus,
  validateVoucherQuery,
  validatePositiveId,
} from "../utils/validation.js";

export const publicVoucherRouter = Router();
export const adminVoucherRouter = Router();

/**
 * @swagger
 * tags:
 *   - name: Vouchers
 *     description: Public Voucher Validation APIs
 *   - name: Admin Vouchers
 *     description: Admin Voucher Management APIs
 */

/**
 * @swagger
 * /vouchers/validate:
 *   post:
 *     summary: Kiểm tra và áp dụng mã giảm giá cho giỏ hàng hiện tại (Public - Guest & User)
 *     tags: [Vouchers]
 *     parameters:
 *       - in: header
 *         name: X-Guest-Token
 *         schema:
 *           type: string
 *         description: Guest Token (nếu là khách chưa đăng nhập)
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
 *               - code_voucher
 *             properties:
 *               code_voucher:
 *                 type: string
 *                 example: SUMMER10
 *     responses:
 *       200:
 *         description: Áp dụng mã giảm giá thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VoucherValidateResponse'
 *       400:
 *         description: Giỏ hàng trống hoặc mã giảm giá không đủ điều kiện (chưa bắt đầu, hết hạn, chưa đạt min order)
 *       404:
 *         description: Mã giảm giá không tồn tại
 *       409:
 *         description: Mã giảm giá đã hết lượt sử dụng
 */
publicVoucherRouter.post(
  "/validate",
  optionalAuth,
  resolveCartOwner({ allowMissingGuest: true }),
  validateBody(validateVoucherApplication),
  validateVoucher,
);

/**
 * @swagger
 * /admin/vouchers:
 *   get:
 *     summary: Lấy danh sách mã giảm giá (Admin)
 *     tags: [Admin Vouchers]
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
 *         description: Tìm theo mã hoặc tên voucher
 *       - in: query
 *         name: discount_type
 *         schema:
 *           type: string
 *           enum: [percentage, fixed_amount]
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, scheduled, expired, exhausted]
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [code_asc, code_desc, created_asc, created_desc, end_at_asc, end_at_desc]
 *           default: created_desc
 *     responses:
 *       200:
 *         description: Danh sách mã giảm giá
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
adminVoucherRouter.get(
  "/vouchers",
  requireAuth,
  requireRole("admin"),
  validateQuery(validateVoucherQuery),
  getVouchers,
);

/**
 * @swagger
 * /admin/vouchers/{voucherId}:
 *   get:
 *     summary: Lấy chi tiết mã giảm giá (Admin)
 *     tags: [Admin Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: voucherId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chi tiết mã giảm giá
 *       404:
 *         description: Không tìm thấy mã giảm giá
 */
adminVoucherRouter.get(
  "/vouchers/:voucherId",
  requireAuth,
  requireRole("admin"),
  validateParam("voucherId", validatePositiveId),
  getVoucherById,
);

/**
 * @swagger
 * /admin/vouchers:
 *   post:
 *     summary: Tạo mã giảm giá mới (Admin)
 *     tags: [Admin Vouchers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code_voucher
 *               - name_voucher
 *               - discount_type
 *               - discount_value
 *             properties:
 *               code_voucher:
 *                 type: string
 *                 example: SUMMER10
 *               name_voucher:
 *                 type: string
 *                 example: Summer 10% Off
 *               discount_type:
 *                 type: string
 *                 enum: [percentage, fixed_amount]
 *                 example: percentage
 *               discount_value:
 *                 type: number
 *                 example: 10
 *               minimum_order_amount:
 *                 type: integer
 *                 example: 500000
 *               maximum_discount_amount:
 *                 type: integer
 *                 example: 100000
 *               usage_limit:
 *                 type: integer
 *                 example: 100
 *               start_at:
 *                 type: string
 *                 format: date-time
 *               end_at:
 *                 type: string
 *                 format: date-time
 *               is_active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Tạo mã giảm giá thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       409:
 *         description: Mã giảm giá đã tồn tại
 */
adminVoucherRouter.post(
  "/vouchers",
  requireAuth,
  requireRole("admin"),
  validateBody(validateCreateVoucher),
  createVoucher,
);

/**
 * @swagger
 * /admin/vouchers/{voucherId}:
 *   patch:
 *     summary: Cập nhật mã giảm giá (Admin)
 *     tags: [Admin Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: voucherId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code_voucher:
 *                 type: string
 *               name_voucher:
 *                 type: string
 *               discount_type:
 *                 type: string
 *                 enum: [percentage, fixed_amount]
 *               discount_value:
 *                 type: number
 *               minimum_order_amount:
 *                 type: integer
 *               maximum_discount_amount:
 *                 type: integer
 *               usage_limit:
 *                 type: integer
 *               start_at:
 *                 type: string
 *                 format: date-time
 *               end_at:
 *                 type: string
 *                 format: date-time
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Cập nhật mã giảm giá thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       404:
 *         description: Không tìm thấy mã giảm giá
 *       409:
 *         description: Mã giảm giá bị trùng lặp
 */
adminVoucherRouter.patch(
  "/vouchers/:voucherId",
  requireAuth,
  requireRole("admin"),
  validateParam("voucherId", validatePositiveId),
  validateBody(validateUpdateVoucher),
  updateVoucher,
);

/**
 * @swagger
 * /admin/vouchers/{voucherId}/status:
 *   patch:
 *     summary: Bật / tắt trạng thái mã giảm giá (Admin)
 *     tags: [Admin Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: voucherId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - is_active
 *             properties:
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
 *       404:
 *         description: Không tìm thấy mã giảm giá
 */
adminVoucherRouter.patch(
  "/vouchers/:voucherId/status",
  requireAuth,
  requireRole("admin"),
  validateParam("voucherId", validatePositiveId),
  validateBody(validateUpdateVoucherStatus),
  updateVoucherStatus,
);

/**
 * @swagger
 * /admin/vouchers/{voucherId}:
 *   delete:
 *     summary: Xóa mã giảm giá (Admin)
 *     tags: [Admin Vouchers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: voucherId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa mã giảm giá thành công
 *       404:
 *         description: Không tìm thấy mã giảm giá
 *       409:
 *         description: Không thể xóa voucher đã có lịch sử đơn hàng
 */
adminVoucherRouter.delete(
  "/vouchers/:voucherId",
  requireAuth,
  requireRole("admin"),
  validateParam("voucherId", validatePositiveId),
  deleteVoucher,
);

/**
 * @swagger
 * components:
 *   schemas:
 *     VoucherItem:
 *       type: object
 *       properties:
 *         voucher_id:
 *           type: integer
 *         code_voucher:
 *           type: string
 *         name_voucher:
 *           type: string
 *         discount_type:
 *           type: string
 *           enum: [percentage, fixed_amount]
 *         discount_value:
 *           type: number
 *         minimum_order_amount:
 *           type: integer
 *         maximum_discount_amount:
 *           type: integer
 *         usage_limit:
 *           type: integer
 *         usage_count:
 *           type: integer
 *         remaining_usage:
 *           type: integer
 *         start_at:
 *           type: string
 *           format: date-time
 *         end_at:
 *           type: string
 *           format: date-time
 *         is_active:
 *           type: boolean
 *         status_voucher:
 *           type: string
 *           enum: [active, inactive, scheduled, expired, exhausted]
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     VoucherValidateResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         code:
 *           type: string
 *           example: VOUCHER_APPLIED
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             voucher_id:
 *               type: integer
 *             code_voucher:
 *               type: string
 *             name_voucher:
 *               type: string
 *             discount_type:
 *               type: string
 *             discount_value:
 *               type: number
 *             subtotal:
 *               type: number
 *             discount_amount:
 *               type: number
 *             total_after_discount:
 *               type: number
 */
