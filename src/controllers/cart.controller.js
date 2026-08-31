import * as cartService from "../services/cart.service.js";
import { ok } from "../utils/api-response.js";
import logger from "../utils/logger.js";

export const createCartController = ({ service = cartService } = {}) => {
  const execute = (method, response) => async (req, res, next) => {
    try {
      const result = await method(req);
      return ok(res, result, response);
    } catch (error) {
      logger.error(`[cart] ${req.method} ${req.originalUrl}`, error);
      return next(error);
    }
  };
  return {
    getCart: execute((req) => service.getCart(req.cartOwner), { code: "CART_RETRIEVED", message: "Lấy giỏ hàng thành công" }),
    addCartItem: execute((req) => service.addCartItem(req.cartOwner, req.validatedBody), { status: 201, code: "CART_ITEM_ADDED", message: "Thêm sản phẩm vào giỏ hàng thành công" }),
    updateCartItem: execute((req) => service.updateCartItem(req.cartOwner, req.validatedParams.cartItemId, req.validatedBody), { code: "CART_ITEM_UPDATED", message: "Cập nhật giỏ hàng thành công" }),
    removeCartItem: execute((req) => service.removeCartItem(req.cartOwner, req.validatedParams.cartItemId), { code: "CART_ITEM_REMOVED", message: "Xóa sản phẩm khỏi giỏ hàng thành công" }),
    clearCart: execute((req) => service.clearCart(req.cartOwner), { code: "CART_CLEARED", message: "Đã xóa toàn bộ giỏ hàng" }),
  };
};

const controller = createCartController();
export const { getCart, addCartItem, updateCartItem, removeCartItem, clearCart } = controller;
