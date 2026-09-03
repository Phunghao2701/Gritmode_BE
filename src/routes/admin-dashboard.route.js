import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { getDashboardStats, getDashboardOverview } from "../controllers/admin-dashboard.controller.js";

const router = Router();

// Guard admin dashboard routes
router.use(requireAuth, requireRole("admin"));

/**
 * @swagger
 * /admin/dashboard/overview:
 *   get:
 *     summary: Thống kê và dữ liệu tổng quan cho Admin Dashboard
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dữ liệu tổng quan
 */
router.get("/overview", getDashboardOverview);

/**
 * @swagger
 * /admin/dashboard/stats:
 *   get:
 *     summary: Thống kê tổng quan cho Admin Dashboard
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê tổng quan
 */
router.get("/stats", getDashboardStats);

export default router;
