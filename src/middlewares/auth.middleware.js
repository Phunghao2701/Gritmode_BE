import jwt from "jsonwebtoken";
import { unauthorized, forbidden } from "../errors/app-error.js";
import { verifyAccessToken } from "../utils/tokens.js";
import { userRepository } from "../repositories/user.repository.js";
import logger from "../utils/logger.js";

/**
 * Middleware xác thực người dùng bằng JWT Bearer Token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(unauthorized("AUTH_REQUIRED", "Không tìm thấy token xác thực hoặc token không hợp lệ"));
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "default-jwt-secret-key";

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      return next(unauthorized("TOKEN_INVALID", "Access token không hợp lệ hoặc đã hết hạn"));
    }

    const userId = payload.sub || payload.user_id;
    const user = await userRepository.findById(userId);
    if (!user) {
      return next(unauthorized("TOKEN_INVALID", "Access token không hợp lệ"));
    }
    if (user.status !== "active") {
      return next(forbidden("ACCOUNT_UNAVAILABLE", "Tài khoản không hoạt động"));
    }

    req.user = {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      session_id: payload.session_id ? Number(payload.session_id) : null,
    };
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware phân quyền người dùng theo Role
 * @param  {...string} roles - Danh sách các role được phép truy cập
 */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(forbidden("FORBIDDEN_ROLE", "Bạn không có quyền thực hiện thao tác này"));
  }
  next();
};

export const verifyToken = requireAuth;

// Cart endpoints accept guests, but a supplied Bearer token must still be valid.
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();
  if (!authHeader.startsWith("Bearer ")) {
    return next(unauthorized("TOKEN_INVALID", "Access token không hợp lệ"));
  }
  return requireAuth(req, res, next);
};

export const createAuthenticate = ({ secret, users = userRepository }) => async (req, res, next) => {
  try {
    const [scheme, token] = (req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) throw unauthorized("AUTH_REQUIRED", "Yêu cầu đăng nhập");
    const payload = verifyAccessToken(token, { secret: secret || process.env.JWT_SECRET || "default-jwt-secret-key" });
    const user = await users.findById(payload.sub || payload.user_id);
    if (!user) throw unauthorized("TOKEN_INVALID", "Access token không hợp lệ");
    if (user.status !== "active") throw forbidden("ACCOUNT_UNAVAILABLE", "Tài khoản không hoạt động");
    req.user = {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      session_id: payload.session_id ? Number(payload.session_id) : null,
    };
    next();
  } catch (error) {
    if (["JsonWebTokenError", "TokenExpiredError"].includes(error.name)) {
      return next(unauthorized("TOKEN_INVALID", "Access token không hợp lệ hoặc đã hết hạn"));
    }
    next(error);
  }
};
