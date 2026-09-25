import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateQuery, validateParam } from "../middlewares/validate.middleware.js";
import {
  validateUuid,
  validateAdminUserQuery,
} from "../utils/validation.js";
import {
  getUsers,
  getUserById,
  blockUser,
  unblockUser,
  setUserInactive,
} from "../controllers/admin-user.controller.js";

export const adminUserRouter = Router();

adminUserRouter.use(requireAuth, requireRole("admin"));

/**
 * @swagger
 * tags:
 *   name: Admin Users
 *   description: Admin APIs for User Management
 */

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Lấy danh sách người dùng (phân trang, tìm kiếm, lọc)
 *     tags:
 *       - Admin Users
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
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [customer, admin]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, blocked]
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: created_at
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           default: DESC
 *     responses:
 *       200:
 *         description: Lấy danh sách người dùng thành công
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
adminUserRouter.get(
  "/",
  validateQuery(validateAdminUserQuery),
  getUsers,
);

/**
 * @swagger
 * /admin/users/{userId}:
 *   get:
 *     summary: Lấy chi tiết người dùng
 *     tags:
 *       - Admin Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Lấy chi tiết người dùng thành công
 *       404:
 *         description: Không tìm thấy người dùng
 */
adminUserRouter.get(
  "/:userId",
  validateParam("userId", validateUuid),
  getUserById,
);

/**
 * @swagger
 * /admin/users/{userId}/block:
 *   patch:
 *     summary: Khóa tài khoản người dùng
 *     tags:
 *       - Admin Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Khóa tài khoản thành công
 *       409:
 *         description: Không thể khóa (Admin tự khóa chính mình hoặc Admin cuối cùng)
 */
adminUserRouter.patch(
  "/:userId/block",
  validateParam("userId", validateUuid),
  blockUser,
);

/**
 * @swagger
 * /admin/users/{userId}/unblock:
 *   patch:
 *     summary: Mở khóa tài khoản người dùng
 *     tags:
 *       - Admin Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Mở khóa tài khoản thành công
 *       409:
 *         description: Người dùng không ở trạng thái blocked
 */
adminUserRouter.patch(
  "/:userId/unblock",
  validateParam("userId", validateUuid),
  unblockUser,
);

/**
 * @swagger
 * /admin/users/{userId}/inactive:
 *   patch:
 *     summary: Vô hiệu hóa tài khoản người dùng
 *     tags:
 *       - Admin Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Vô hiệu hóa tài khoản thành công
 *       409:
 *         description: Không thể vô hiệu hóa
 */
adminUserRouter.patch(
  "/:userId/inactive",
  validateParam("userId", validateUuid),
  setUserInactive,
);

export default adminUserRouter;
