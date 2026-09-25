import { ok } from "../utils/api-response.js";
import { cookieOptions } from "./auth.controller.js";
import { getConfig } from "../config/env.js";
import * as userSessionService from "../services/user-session.service.js";
import logger from "../utils/logger.js";

const config = getConfig();

export const createUserSessionController = ({
  sessionService = userSessionService,
  cfg = config,
} = {}) => ({
  /**
   * GET /api/v1/users/me/sessions
   */
  getMySessions: async (req, res, next) => {
    try {
      const userId = req.user.user_id;
      const currentSessionId = req.user?.session_id;
      const sessions = await sessionService.getUserSessions(userId, currentSessionId);
      return ok(res, sessions, { message: "Get sessions successfully" });
    } catch (error) {
      logger.error("[user-session] getMySessions error:", error);
      next(error);
    }
  },

  /**
   * DELETE /api/v1/users/me/sessions/:sessionId
   */
  revokeMySession: async (req, res, next) => {
    try {
      const userId = req.user.user_id;
      const sessionId = req.validatedParams ? req.validatedParams.sessionId : req.params.sessionId;
      await sessionService.revokeSession(userId, sessionId);
      return ok(res, null, { code: "SESSION_REVOKED", message: "Đã thu hồi phiên đăng nhập" });
    } catch (error) {
      logger.error("[user-session] revokeMySession error:", error);
      next(error);
    }
  },

  /**
   * DELETE /api/v1/users/me/sessions
   */
  revokeAllMySessions: async (req, res, next) => {
    try {
      const userId = req.user.user_id;
      await sessionService.revokeAllUserSessions(userId);
      res.clearCookie("refresh_token", cookieOptions(cfg));
      return ok(res, null, { code: "SESSIONS_REVOKED", message: "Đã đăng xuất khỏi tất cả thiết bị" });
    } catch (error) {
      logger.error("[user-session] revokeAllMySessions error:", error);
      next(error);
    }
  },
});

const defaultUserSessionController = createUserSessionController();
export const {
  getMySessions,
  revokeMySession,
  revokeAllMySessions,
} = defaultUserSessionController;
