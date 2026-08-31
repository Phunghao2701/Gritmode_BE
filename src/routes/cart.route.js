import { Router } from "express";
import { optionalAuth } from "../middlewares/auth.middleware.js";
import { resolveCartOwner } from "../middlewares/cart.middleware.js";
import { validateBody, validateParam } from "../middlewares/validate.middleware.js";
import { validateAddCartItem, validateCartItemId, validateUpdateCartItem } from "../utils/cart-validation.js";
import { getCart, addCartItem, updateCartItem, removeCartItem, clearCart } from "../controllers/cart.controller.js";

const router = Router();
router.use(optionalAuth);

/**
 * @swagger
 * components:
 *   parameters:
 *     GuestToken:
 *       in: header
 *       name: X-Guest-Token
 *       required: false
 *       schema: { type: string }
 *       description: Token sở hữu guest cart. Không cần gửi khi dùng Bearer token.
 *   schemas:
 *     CartItemInput:
 *       type: object
 *       required: [product_variant_id, quantity]
 *       properties:
 *         product_variant_id: { type: integer, minimum: 1, example: 101 }
 *         quantity: { type: integer, minimum: 1, example: 2 }
 *     Cart:
 *       type: object
 *       properties:
 *         cart_id: { type: integer, nullable: true }
 *         status_cart: { type: string, nullable: true, enum: [active, converted, abandoned] }
 *         guest_token: { type: string, nullable: true }
 *         items: { type: array, items: { type: object } }
 *         summary: { type: object }
 */

/**
 * @swagger
 * /cart:
 *   get:
 *     tags: [Cart]
 *     summary: Lấy giỏ hàng hiện tại của guest hoặc user
 *     security: [{ bearerAuth: [] }, {}]
 *     parameters: [{ $ref: '#/components/parameters/GuestToken' }]
 *     responses:
 *       200: { description: Cart hiện tại hoặc cart rỗng }
 *   delete:
 *     tags: [Cart]
 *     summary: Xóa toàn bộ item trong cart active
 *     security: [{ bearerAuth: [] }, {}]
 *     parameters: [{ $ref: '#/components/parameters/GuestToken' }]
 *     responses:
 *       200: { description: Cart đã được làm rỗng }
 *       400: { description: Guest token bị thiếu hoặc không hợp lệ }
 */
router.get("/", resolveCartOwner({ allowMissingGuest: true }), getCart);
router.delete("/", resolveCartOwner(), clearCart);

/**
 * @swagger
 * /cart/items:
 *   post:
 *     tags: [Cart]
 *     summary: Thêm variant vào cart; tự tạo guest cart nếu cần
 *     security: [{ bearerAuth: [] }, {}]
 *     parameters: [{ $ref: '#/components/parameters/GuestToken' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CartItemInput' }
 *     responses:
 *       201: { description: Đã thêm item; response chứa guest_token nếu vừa tạo guest cart }
 *       404: { description: Variant hoặc inventory không tồn tại }
 *       409: { description: Quantity vượt quá tồn kho khả dụng }
 */
router.post("/items", resolveCartOwner({ allowMissingGuest: true }), validateBody(validateAddCartItem), addCartItem);

/**
 * @swagger
 * /cart/items/{cartItemId}:
 *   patch:
 *     tags: [Cart]
 *     summary: Cập nhật quantity của item thuộc cart hiện tại
 *     security: [{ bearerAuth: [] }, {}]
 *     parameters:
 *       - { $ref: '#/components/parameters/GuestToken' }
 *       - { in: path, name: cartItemId, required: true, schema: { type: integer, minimum: 1 } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties: { quantity: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { description: Đã cập nhật item }
 *       404: { description: Item không thuộc cart hiện tại }
 *       409: { description: Quantity vượt tồn kho }
 *   delete:
 *     tags: [Cart]
 *     summary: Xóa item thuộc cart hiện tại
 *     security: [{ bearerAuth: [] }, {}]
 *     parameters:
 *       - { $ref: '#/components/parameters/GuestToken' }
 *       - { in: path, name: cartItemId, required: true, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { description: Đã xóa item }
 *       404: { description: Item không thuộc cart hiện tại }
 */
router.patch("/items/:cartItemId", resolveCartOwner(), validateParam("cartItemId", validateCartItemId), validateBody(validateUpdateCartItem), updateCartItem);
router.delete("/items/:cartItemId", resolveCartOwner(), validateParam("cartItemId", validateCartItemId), removeCartItem);

export default router;
