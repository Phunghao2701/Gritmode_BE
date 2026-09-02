import { ok } from "../utils/api-response.js";
import * as orderService from "../services/order.service.js";
import logger from "../utils/logger.js";

export const createOrderController = ({
  orders = orderService,
} = {}) => ({
  /**
   * POST /api/v1/orders
   */
  createOrder: async (req, res, next) => {
    try {
      const payload = req.validatedBody || req.body;
      const context = {
        owner: req.cartOwner,
        user: req.user || null,
      };
      const result = await orders.createOrder(payload, context);
      return ok(res, result, {
        status: 201,
        code: "ORDER_CREATED",
        message: "Đặt hàng thành công",
      });
    } catch (error) {
      logger.error("[order] createOrder error:", error);
      next(error);
    }
  },

  /**
   * GET /api/v1/orders
   */
  getMyOrders: async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query;
      const result = await orders.getUserOrders(req.user.user_id, query);
      return ok(res, result, { message: "Lấy danh sách đơn hàng thành công" });
    } catch (error) {
      logger.error("[order] getMyOrders error:", error);
      next(error);
    }
  },

  /**
   * GET /api/v1/orders/:orderId
   */
  getMyOrderById: async (req, res, next) => {
    try {
      const orderId = req.validatedParams ? req.validatedParams.orderId : req.params.orderId;
      const result = await orders.getUserOrderById(orderId, req.user?.user_id || null);
      return ok(res, result, { message: "Lấy chi tiết đơn hàng thành công" });
    } catch (error) {
      logger.error("[order] getMyOrderById error:", error);
      next(error);
    }
  },

  /**
   * PATCH /api/v1/orders/:orderId/cancel
   */
  cancelMyOrder: async (req, res, next) => {
    try {
      const orderId = req.validatedParams ? req.validatedParams.orderId : req.params.orderId;
      const result = await orders.cancelUserOrder(orderId, req.user.user_id);
      return ok(res, result, { message: "Hủy đơn hàng thành công" });
    } catch (error) {
      logger.error("[order] cancelMyOrder error:", error);
      next(error);
    }
  },

  /**
   * POST /api/v1/orders/guest/lookup
   */
  lookupGuestOrder: async (req, res, next) => {
    try {
      const payload = req.validatedBody || req.body;
      const result = await orders.lookupGuestOrder(payload);
      return ok(res, result, { message: "Tra cứu đơn hàng thành công" });
    } catch (error) {
      logger.error("[order] lookupGuestOrder error:", error);
      next(error);
    }
  },

  /**
   * POST /api/v1/orders/guest/:orderCode/cancel
   */
  cancelGuestOrder: async (req, res, next) => {
    try {
      const orderCode = req.params.orderCode;
      const payload = req.validatedBody || req.body;
      const result = await orders.cancelGuestOrder(orderCode, payload);
      return ok(res, result, { message: "Hủy đơn hàng thành công" });
    } catch (error) {
      logger.error("[order] cancelGuestOrder error:", error);
      next(error);
    }
  },
});

const defaultOrderController = createOrderController();
export const {
  createOrder,
  getMyOrders,
  getMyOrderById,
  cancelMyOrder,
  lookupGuestOrder,
  cancelGuestOrder,
} = defaultOrderController;

