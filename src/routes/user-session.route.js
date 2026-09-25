import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validateParam } from "../middlewares/validate.middleware.js";
import { validateSessionId } from "../utils/validation.js";
import {
  getMySessions,
  revokeMySession,
  revokeAllMySessions,
} from "../controllers/user-session.controller.js";

export const userSessionRouter = Router();

userSessionRouter.use(requireAuth);

/**
 * @swagger
 * tags:
 *   name: Sessions
 *   description: User Session Management APIs
 */

/**
 * @swagger
 * /users/me/sessions:
 *   get:
 *     summary: Lấy danh sách Session của User hiện tại
 *     tags:
 *       - Sessions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách session thành công
 *       401:
 *         description: Chưa đăng nhập hoặc token không hợp lệ
 *   delete:
 *     summary: Thu hồi toàn bộ Session của User (đăng xuất khỏi tất cả thiết bị)
 *     tags:
 *       - Sessions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đã thu hồi toàn bộ session
 *       401:
 *         description: Chưa đăng nhập hoặc token không hợp lệ
 */
userSessionRouter.get("/", getMySessions);
userSessionRouter.delete("/", revokeAllMySessions);

/**
 * @swagger
 * /users/me/sessions/{sessionId}:
 *   delete:
 *     summary: Thu hồi một Session cụ thể của User
 *     tags:
 *       - Sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Đã thu hồi session
 *       400:
 *         description: ID session không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc token không hợp lệ
 *       404:
 *         description: Không tìm thấy session
 */
userSessionRouter.delete(
  "/:sessionId",
  validateParam("sessionId", validateSessionId),
  revokeMySession,
);

export default userSessionRouter;
