import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateQuery, validateParam } from "../middlewares/validate.middleware.js";
import {
  validateAuditLogId,
  validateAuditLogQuery,
} from "../utils/validation.js";
import {
  getAuditLogs,
  getAuditLogById,
} from "../controllers/admin-audit-log.controller.js";

export const adminAuditLogRouter = Router();

adminAuditLogRouter.use(requireAuth, requireRole("admin"));

/**
 * @swagger
 * tags:
 *   name: Admin Audit Logs
 *   description: Read-only APIs for Admin Audit Logs
 */

/**
 * @swagger
 * /admin/audit-logs:
 *   get:
 *     summary: Lấy danh sách nhật ký quản trị (phân trang, lọc, tìm kiếm)
 *     tags:
 *       - Admin Audit Logs
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
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: entity
 *         schema:
 *           type: string
 *       - in: query
 *         name: entity_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: admin_user_id
 *         schema:
 *           type: string
 *           format: uuid
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
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *     responses:
 *       200:
 *         description: Lấy danh sách nhật ký thành công
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
adminAuditLogRouter.get(
  "/",
  validateQuery(validateAuditLogQuery),
  getAuditLogs,
);

/**
 * @swagger
 * /admin/audit-logs/{auditLogId}:
 *   get:
 *     summary: Lấy chi tiết nhật ký quản trị
 *     tags:
 *       - Admin Audit Logs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: auditLogId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lấy chi tiết nhật ký thành công
 *       404:
 *         description: Không tìm thấy nhật ký
 */
adminAuditLogRouter.get(
  "/:auditLogId",
  validateParam("auditLogId", validateAuditLogId),
  getAuditLogById,
);

export default adminAuditLogRouter;
