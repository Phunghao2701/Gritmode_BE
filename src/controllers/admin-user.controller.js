import { ok } from "../utils/api-response.js";
import * as adminUserService from "../services/admin-user.service.js";
import logger from "../utils/logger.js";

export const createAdminUserController = ({
  users = adminUserService,
} = {}) => ({
  /**
   * GET /api/v1/admin/users
   */
  getUsers: async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query || {};
      const result = await users.getUsers(query);
      return ok(res, result, { message: "Lấy danh sách người dùng thành công" });
    } catch (error) {
      logger.error("[admin-user] getUsers error:", error);
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/users/:userId
   */
  getUserById: async (req, res, next) => {
    try {
      const userId = req.validatedParams ? req.validatedParams.userId : req.params.userId;
      const result = await users.getUserById(userId);
      return ok(res, result, { message: "Lấy chi tiết người dùng thành công" });
    } catch (error) {
      logger.error("[admin-user] getUserById error:", error);
      next(error);
    }
  },

  /**
   * PATCH /api/v1/admin/users/:userId/block
   */
  blockUser: async (req, res, next) => {
    try {
      const userId = req.validatedParams ? req.validatedParams.userId : req.params.userId;
      const adminId = req.user.user_id;
      const result = await users.blockUser(userId, adminId);
      return ok(res, result, { message: "Khóa tài khoản người dùng thành công" });
    } catch (error) {
      logger.error("[admin-user] blockUser error:", error);
      next(error);
    }
  },

  /**
   * PATCH /api/v1/admin/users/:userId/unblock
   */
  unblockUser: async (req, res, next) => {
    try {
      const userId = req.validatedParams ? req.validatedParams.userId : req.params.userId;
      const adminId = req.user.user_id;
      const result = await users.unblockUser(userId, adminId);
      return ok(res, result, { message: "Mở khóa tài khoản người dùng thành công" });
    } catch (error) {
      logger.error("[admin-user] unblockUser error:", error);
      next(error);
    }
  },

  /**
   * PATCH /api/v1/admin/users/:userId/inactive
   */
  setUserInactive: async (req, res, next) => {
    try {
      const userId = req.validatedParams ? req.validatedParams.userId : req.params.userId;
      const adminId = req.user.user_id;
      const result = await users.setUserInactive(userId, adminId);
      return ok(res, result, { message: "Vô hiệu hóa tài khoản người dùng thành công" });
    } catch (error) {
      logger.error("[admin-user] setUserInactive error:", error);
      next(error);
    }
  },
});

const defaultAdminUserController = createAdminUserController();
export const {
  getUsers,
  getUserById,
  blockUser,
  unblockUser,
  setUserInactive,
} = defaultAdminUserController;
