import * as cartService from "../services/cart.service.js";
import { ok, created } from "../utils/api-response.js";
import logger from "../utils/logger.js";

export const getCart = async (req, res, next) => {
  try {
    const result = await cartService.getCart(req.cartOwner);
    return ok(res, result, { code: "CART_RETRIEVED", message: "Lấy giỏ hàng thành công" });
  } catch (error) {
    logger.error("[cart] getCart error:", error);
    next(error);
  }
};

export const addCartItem = async (req, res, next) => {
  try {
    const result = await cartService.addCartItem(req.cartOwner, req.validatedBody);
    return created(res, result, { code: "CART_ITEM_ADDED", message: "Thêm sản phẩm vào giỏ hàng thành công" });
  } catch (error) {
    logger.error("[cart] addCartItem error:", error);
    next(error);
  }
};

export const updateCartItem = async (req, res, next) => {
  try {
    const cartItemId = req.validatedParams ? req.validatedParams.cartItemId : req.params.cartItemId;
    const result = await cartService.updateCartItem(req.cartOwner, cartItemId, req.validatedBody);
    return ok(res, result, { code: "CART_ITEM_UPDATED", message: "Cập nhật giỏ hàng thành công" });
  } catch (error) {
    logger.error("[cart] updateCartItem error:", error);
    next(error);
  }
};

export const removeCartItem = async (req, res, next) => {
  try {
    const cartItemId = req.validatedParams ? req.validatedParams.cartItemId : req.params.cartItemId;
    const result = await cartService.removeCartItem(req.cartOwner, cartItemId);
    return ok(res, result, { code: "CART_ITEM_REMOVED", message: "Xóa sản phẩm khỏi giỏ hàng thành công" });
  } catch (error) {
    logger.error("[cart] removeCartItem error:", error);
    next(error);
  }
};

export const clearCart = async (req, res, next) => {
  try {
    const result = await cartService.clearCart(req.cartOwner);
    return ok(res, result, { code: "CART_CLEARED", message: "Đã xóa toàn bộ giỏ hàng" });
  } catch (error) {
    logger.error("[cart] clearCart error:", error);
    next(error);
  }
};
