import { ok } from "../utils/api-response.js";
import { getConfig } from "../config/env.js";
import * as authService from "../services/auth.service.js";
import logger from "../utils/logger.js";

const config = getConfig();

const context = (req) => ({ userAgent: req.get("user-agent"), ipAddress: req.ip });
export const cookieOptions = (cfg = config) => {
  const isProd = cfg.nodeEnv === "production" && !cfg.frontendUrl?.includes("localhost");
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: cfg.refreshTtlMs,
    path: "/api/v1",
  };
};

export const clearCookieOptions = (cfg = config) => {
  const isProd = cfg.nodeEnv === "production" && !cfg.frontendUrl?.includes("localhost");
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/api/v1",
  };
};

export const createAuthController = ({ service = authService, config: cfg = config } = {}) => ({
  /**
   * POST /api/v1/auth/request-otp
   */
  requestOtp: async (req, res, next) => {
    try {
      const result = await service.requestOtp(req.validatedBody || req.body, context(req));
      return ok(res, result, { code: "OTP_SENT", message: "Mã OTP đã được gửi đến email của bạn" });
    } catch (error) {
      logger.error("[auth] requestOtp error:", error);
      next(error);
    }
  },

  /**
   * POST /api/v1/auth/verify-otp
   */
  verifyOtp: async (req, res, next) => {
    try {
      const result = await service.verifyOtp(req.validatedBody || req.body, context(req));
      res.cookie("refresh_token", result.refresh_token, cookieOptions(cfg));
      const { refresh_token, ...data } = result;
      return ok(res, data, { code: "AUTHENTICATED", message: "Xác thực thành công" });
    } catch (error) {
      logger.error("[auth] verifyOtp error:", error);
      next(error);
    }
  },

  /**
   * POST /api/v1/auth/refresh
   */
  refresh: async (req, res, next) => {
    try {
      const rawToken = req.cookies?.refresh_token;
      const result = await service.refresh(rawToken, context(req));
      res.cookie("refresh_token", result.refresh_token, cookieOptions(cfg));
      const { refresh_token, ...data } = result;
      return ok(res, data, { code: "TOKEN_REFRESHED", message: "Làm mới token thành công" });
    } catch (error) {
      if (error?.statusCode === 401) {
        res.clearCookie("refresh_token", clearCookieOptions(cfg));
        logger.warn(`[auth] refresh rejected: ${error.code}`);
      } else {
        logger.error("[auth] refresh error:", error);
      }
      next(error);
    }
  },

  /**
   * POST /api/v1/auth/logout
   */
  logout: async (req, res, next) => {
    try {
      const rawToken = req.cookies?.refresh_token;
      await service.logout(rawToken);
      res.clearCookie("refresh_token", clearCookieOptions(cfg));
      return ok(res, null, { code: "LOGGED_OUT", message: "Đăng xuất thành công" });
    } catch (error) {
      logger.error("[auth] logout error:", error);
      next(error);
    }
  },

  /**
   * GET /api/v1/auth/me
   */
  me: async (req, res, next) => {
    try {
      const user = await service.me(req.user.user_id);
      return ok(res, user, { code: "USER_PROFILE", message: "Lấy thông tin người dùng thành công" });
    } catch (error) {
      logger.error("[auth] me error:", error);
      next(error);
    }
  },
});

const defaultAuthController = createAuthController();

export const requestOtp = defaultAuthController.requestOtp;
export const verifyOtp = defaultAuthController.verifyOtp;
export const refresh = defaultAuthController.refresh;
export const logout = defaultAuthController.logout;
export const me = defaultAuthController.me;
