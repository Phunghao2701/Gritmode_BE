import { ok } from "../utils/api-response.js";
import * as adminOrderService from "../services/admin-order.service.js";
import logger from "../utils/logger.js";

export const createAdminOrderController = ({
  orders = adminOrderService,
} = {}) => ({
  /**
   * GET /api/v1/admin/orders
   */
  getOrders: async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query;
      const result = await orders.getOrders(query);
      return ok(res, result, { message: "Lấy danh sách đơn hàng thành công" });
    } catch (error) {
      logger.error("[admin-order] getOrders error:", error);
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/orders/:orderId
   */
  getOrderById: async (req, res, next) => {
    try {
      const orderId = req.validatedParams ? req.validatedParams.orderId : req.params.orderId;
      const result = await orders.getOrderById(orderId);
      return ok(res, result, { message: "Lấy chi tiết đơn hàng thành công" });
    } catch (error) {
      logger.error("[admin-order] getOrderById error:", error);
      next(error);
    }
  },

  /**
   * PATCH /api/v1/admin/orders/:orderId/confirm
   */
  confirmOrder: async (req, res, next) => {
    try {
      const orderId = req.validatedParams ? req.validatedParams.orderId : req.params.orderId;
      const result = await orders.confirmOrder(orderId, req.user.user_id);
      return ok(res, result, { message: "Xác nhận đơn hàng thành công" });
    } catch (error) {
      logger.error("[admin-order] confirmOrder error:", error);
      next(error);
    }
  },

  /**
   * PATCH /api/v1/admin/orders/:orderId/processing
   */
  processOrder: async (req, res, next) => {
    try {
      const orderId = req.validatedParams ? req.validatedParams.orderId : req.params.orderId;
      const result = await orders.processOrder(orderId, req.user.user_id);
      return ok(res, result, { message: "Chuyển đơn hàng sang chuẩn bị hàng thành công" });
    } catch (error) {
      logger.error("[admin-order] processOrder error:", error);
      next(error);
    }
  },

  /**
   * PATCH /api/v1/admin/orders/:orderId/shipping
   */
  shipOrder: async (req, res, next) => {
    try {
      const orderId = req.validatedParams ? req.validatedParams.orderId : req.params.orderId;
      const result = await orders.shipOrder(orderId, req.user.user_id);
      return ok(res, result, { message: "Chuyển đơn hàng sang giao hàng thành công" });
    } catch (error) {
      logger.error("[admin-order] shipOrder error:", error);
      next(error);
    }
  },

  /**
   * PATCH /api/v1/admin/orders/:orderId/complete
   */
  completeOrder: async (req, res, next) => {
    try {
      const orderId = req.validatedParams ? req.validatedParams.orderId : req.params.orderId;
      const result = await orders.completeOrder(orderId, req.user.user_id);
      return ok(res, result, { message: "Hoàn tất đơn hàng thành công" });
    } catch (error) {
      logger.error("[admin-order] completeOrder error:", error);
      next(error);
    }
  },

  /**
   * PATCH /api/v1/admin/orders/:orderId/cancel
   */
  cancelOrder: async (req, res, next) => {
    try {
      const orderId = req.validatedParams ? req.validatedParams.orderId : req.params.orderId;
      const payload = req.validatedBody || req.body || {};
      const result = await orders.cancelOrder(orderId, {
        reason: payload.reason,
        adminUserId: req.user.user_id,
      });
      return ok(res, result, { message: "Hủy đơn hàng thành công" });
    } catch (error) {
      logger.error("[admin-order] cancelOrder error:", error);
      next(error);
    }
  },
});

const defaultAdminOrderController = createAdminOrderController();
export const {
  getOrders,
  getOrderById,
  confirmOrder,
  processOrder,
  shipOrder,
  completeOrder,
  cancelOrder,
} = defaultAdminOrderController;
