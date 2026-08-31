import { AppError, conflict, forbidden, notFound, unauthorized } from "../errors/app-error.js";
import { safeUser } from "./auth.service.js";
import { formatSession } from "./user-session.service.js";
import { userRepository } from "../repositories/user.repository.js";
import { sessionRepository } from "../repositories/session.repository.js";

export const createUserService = ({
  users = userRepository,
  sessions = sessionRepository,
} = {}) => ({
  async getProfile(userId) {
    const user = await users.findById(userId);
    if (!user) throw notFound("USER_NOT_FOUND", "Không tìm thấy người dùng");
    return safeUser(user);
  },

  async updateProfile(userId, input) {
    const forbiddenFields = ["role", "status", "type", "password", "email", "user_id", "password_hash", "refresh_token_hash"];
    if (forbiddenFields.some((field) => field in input)) {
      throw forbidden("PROFILE_FIELD_FORBIDDEN", "Không được cập nhật trường này");
    }

    if (input.phone && users.findByPhone) {
      const existingPhoneUser = await users.findByPhone(input.phone);
      if (existingPhoneUser && existingPhoneUser.user_id !== userId) {
        throw conflict("PHONE_EXISTS", "Số điện thoại đã được sử dụng bởi tài khoản khác");
      }
    }

    let user;
    try {
      user = await users.updateProfile(userId, input);
    } catch (error) {
      if (error.code === "23505" || error.constraint?.includes("phone") || /phone.*already exists|unique constraint.*phone/i.test(error.message || "")) {
        throw conflict("PHONE_EXISTS", "Số điện thoại đã được sử dụng bởi tài khoản khác");
      }
      throw error;
    }

    if (!user) throw notFound("USER_NOT_FOUND", "Không tìm thấy người dùng");
    return safeUser(user);
  },

  async changePassword(userId, input, currentSessionId) {
    if (!currentSessionId) {
      throw unauthorized("SESSION_REQUIRED", "Không xác định được phiên làm việc hiện tại");
    }
    throw new AppError(
      400,
      "PASSWORD_NOT_SUPPORTED",
      "Hệ thống sử dụng đăng nhập OTP và không lưu mật khẩu",
    );
  },

  async listSessions(userId, currentSessionId) {
    const list = await sessions.listByUser(userId);
    return (list || []).map((s) => formatSession(s, currentSessionId));
  },

  async revokeSession(userId, sessionId) {
    if (!await sessions.revokeOwned(Number(sessionId), userId)) {
      throw notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên đăng nhập");
    }
  },

  revokeAllSessions: (userId) => sessions.revokeAllByUser(userId),
});

const defaultUserService = createUserService();

export const {
  getProfile,
  updateProfile,
  changePassword,
  listSessions,
  revokeSession,
  revokeAllSessions,
} = defaultUserService;
