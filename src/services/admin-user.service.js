import { conflict, notFound } from "../errors/app-error.js";
import { userRepository } from "../repositories/user.repository.js";
import { sessionRepository } from "../repositories/session.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";

const VALID_USER_TRANSITIONS = {
  active: ["blocked", "inactive"],
  inactive: ["active", "blocked"],
  blocked: ["active"],
};

export const sanitizeUser = (user) => {
  if (!user) return null;
  const {
    password,
    password_hash,
    otp_hash,
    refresh_token_hash,
    ...sanitized
  } = user;
  return sanitized;
};

export const createAdminUserService = ({
  users = userRepository,
  sessions = sessionRepository,
  audits = auditRepository,
  transaction = withTransaction,
} = {}) => ({
  /**
   * Validate user status transition
   */
  validateUserStatusTransition(currentStatus, nextStatus) {
    if (currentStatus === nextStatus) return false;
    const allowed = VALID_USER_TRANSITIONS[currentStatus] || [];
    return allowed.includes(nextStatus);
  },

  /**
   * Get paginated users with filters and search
   */
  async getUsers(query = {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [total, items] = await Promise.all([
      users.countAdminUsers(query),
      users.findAdminUsers(query),
    ]);

    const sanitizedItems = items.map(sanitizeUser);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: sanitizedItems,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
      },
    };
  },

  /**
   * Get single user detail by userId
   */
  async getUserById(userId) {
    const user = await users.findById(userId);
    if (!user) {
      throw notFound("USER_NOT_FOUND", "Không tìm thấy người dùng");
    }
    return sanitizeUser(user);
  },

  /**
   * Block User
   */
  async blockUser(targetUserId, adminId) {
    if (targetUserId === adminId) {
      throw conflict("SELF_ACTION_NOT_ALLOWED", "Admin không thể tự khóa tài khoản của chính mình");
    }

    return transaction(async (client) => {
      const targetUser = await users.lockUserById(targetUserId, client);
      if (!targetUser) {
        throw notFound("USER_NOT_FOUND", "Không tìm thấy người dùng");
      }

      if (!this.validateUserStatusTransition(targetUser.status, "blocked")) {
        throw conflict(
          "INVALID_STATUS_TRANSITION",
          `Không thể chuyển trạng thái người dùng từ ${targetUser.status} sang blocked`,
        );
      }

      // Check last admin protection
      if (targetUser.role === "admin") {
        const activeAdmins = await users.countActiveAdmins(client);
        if (activeAdmins <= 1) {
          throw conflict("LAST_ADMIN_PROTECTED", "Không thể khóa Admin cuối cùng trong hệ thống");
        }
      }

      const updatedUser = await users.updateUserStatus(targetUserId, "blocked", client);
      await sessions.revokeAllByUserId(targetUserId, client);

      await audits.log(
        {
          userId: adminId,
          action: "USER_BLOCKED",
          entity: "user",
          entityId: targetUserId,
          oldData: { status: targetUser.status },
          newData: { status: "blocked" },
        },
        client,
      );

      return sanitizeUser(updatedUser);
    });
  },

  /**
   * Unblock User
   */
  async unblockUser(targetUserId, adminId) {
    return transaction(async (client) => {
      const targetUser = await users.lockUserById(targetUserId, client);
      if (!targetUser) {
        throw notFound("USER_NOT_FOUND", "Không tìm thấy người dùng");
      }

      if (!this.validateUserStatusTransition(targetUser.status, "active")) {
        throw conflict(
          "INVALID_STATUS_TRANSITION",
          `Không thể chuyển trạng thái người dùng từ ${targetUser.status} sang active`,
        );
      }

      const updatedUser = await users.updateUserStatus(targetUserId, "active", client);

      await audits.log(
        {
          userId: adminId,
          action: "USER_UNBLOCKED",
          entity: "user",
          entityId: targetUserId,
          oldData: { status: targetUser.status },
          newData: { status: "active" },
        },
        client,
      );

      return sanitizeUser(updatedUser);
    });
  },

  /**
   * Set User Inactive
   */
  async setUserInactive(targetUserId, adminId) {
    if (targetUserId === adminId) {
      throw conflict("SELF_ACTION_NOT_ALLOWED", "Admin không thể tự vô hiệu hóa tài khoản của chính mình");
    }

    return transaction(async (client) => {
      const targetUser = await users.lockUserById(targetUserId, client);
      if (!targetUser) {
        throw notFound("USER_NOT_FOUND", "Không tìm thấy người dùng");
      }

      if (!this.validateUserStatusTransition(targetUser.status, "inactive")) {
        throw conflict(
          "INVALID_STATUS_TRANSITION",
          `Không thể chuyển trạng thái người dùng từ ${targetUser.status} sang inactive`,
        );
      }

      // Check last admin protection
      if (targetUser.role === "admin") {
        const activeAdmins = await users.countActiveAdmins(client);
        if (activeAdmins <= 1) {
          throw conflict("LAST_ADMIN_PROTECTED", "Không thể vô hiệu hóa Admin cuối cùng trong hệ thống");
        }
      }

      const updatedUser = await users.updateUserStatus(targetUserId, "inactive", client);
      await sessions.revokeAllByUserId(targetUserId, client);

      await audits.log(
        {
          userId: adminId,
          action: "USER_SET_INACTIVE",
          entity: "user",
          entityId: targetUserId,
          oldData: { status: targetUser.status },
          newData: { status: "inactive" },
        },
        client,
      );

      return sanitizeUser(updatedUser);
    });
  },
});

const defaultAdminUserService = createAdminUserService();
export const adminUserService = defaultAdminUserService;
export const {
  getUsers,
  getUserById,
  blockUser,
  unblockUser,
  setUserInactive,
  validateUserStatusTransition,
} = defaultAdminUserService;
