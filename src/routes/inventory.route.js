import { Router } from "express";
import {
  getInventories,
  getInventoryByVariantId,
  updateInventory,
} from "../controllers/inventory.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateBody, validateQuery, validateParam } from "../middlewares/validate.middleware.js";
import { validateInventoryQuery, validateUpdateInventory, validatePositiveId } from "../utils/validation.js";

const inventoryRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Admin Inventory Management APIs
 */

/**
 * @swagger
 * /admin/inventory:
 *   get:
 *     summary: Lấy danh sách tồn kho (Admin)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Trang hiện tại
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Số lượng mỗi trang
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo tên sản phẩm hoặc SKU
 *       - in: query
 *         name: low_stock
 *         schema:
 *           type: boolean
 *         description: Lọc sản phẩm sắp hết hàng (quantity_available <= 5)
 *       - in: query
 *         name: out_of_stock
 *         schema:
 *           type: boolean
 *         description: Lọc sản phẩm hết hàng (quantity_available <= 0)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [stock_asc, stock_desc, available_asc, available_desc, sku_asc, sku_desc, updated_desc]
 *           default: updated_desc
 *         description: Cách sắp xếp kết quả
 *     responses:
 *       200:
 *         description: Danh sách tồn kho
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 code:
 *                   type: string
 *                   example: INVENTORY_LIST
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/InventoryItem'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Tham số query không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
inventoryRouter.get(
  "/inventory",
  requireAuth,
  requireRole("admin"),
  validateQuery(validateInventoryQuery),
  getInventories,
);

/**
 * @swagger
 * /admin/product-variants/{variantId}/inventory:
 *   get:
 *     summary: Lấy tồn kho của một Variant (Admin)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của Product Variant
 *     responses:
 *       200:
 *         description: Chi tiết tồn kho
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 code:
 *                   type: string
 *                   example: INVENTORY_DETAIL
 *                 data:
 *                   $ref: '#/components/schemas/InventoryItem'
 *       400:
 *         description: variantId không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy Variant hoặc Inventory
 */
inventoryRouter.get(
  "/product-variants/:variantId/inventory",
  requireAuth,
  requireRole("admin"),
  validateParam("variantId", validatePositiveId),
  getInventoryByVariantId,
);

/**
 * @swagger
 * /admin/product-variants/{variantId}/inventory:
 *   patch:
 *     summary: Cập nhật tồn kho thực tế của Variant (Admin)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của Product Variant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity_stock
 *             properties:
 *               quantity_stock:
 *                 type: integer
 *                 minimum: 0
 *                 description: Số lượng tồn kho thực tế mới
 *                 example: 25
 *     responses:
 *       200:
 *         description: Tồn kho đã được cập nhật
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 code:
 *                   type: string
 *                   example: INVENTORY_UPDATED
 *                 data:
 *                   $ref: '#/components/schemas/InventoryItem'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy Variant hoặc Inventory
 *       409:
 *         description: Số lượng tồn kho thấp hơn số lượng đang đặt trước
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: STOCK_BELOW_RESERVED
 *                 message:
 *                   type: string
 */
inventoryRouter.patch(
  "/product-variants/:variantId/inventory",
  requireAuth,
  requireRole("admin"),
  validateParam("variantId", validatePositiveId),
  validateBody(validateUpdateInventory),
  updateInventory,
);

/**
 * @swagger
 * components:
 *   schemas:
 *     InventoryItem:
 *       type: object
 *       properties:
 *         inventory_id:
 *           type: integer
 *         product_variant_id:
 *           type: integer
 *         product_id:
 *           type: integer
 *         name_product:
 *           type: string
 *         sku:
 *           type: string
 *         quantity_stock:
 *           type: integer
 *           description: Tổng số lượng hàng trong kho
 *         quantity_reserved:
 *           type: integer
 *           description: Số lượng đang được giữ chỗ cho đơn hàng
 *         quantity_available:
 *           type: integer
 *           description: Số lượng có thể bán (= stock - reserved)
 *         is_low_stock:
 *           type: boolean
 *           description: Hàng sắp hết (quantity_available <= 5)
 *         is_out_of_stock:
 *           type: boolean
 *           description: Hết hàng (quantity_available <= 0)
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

export default inventoryRouter;
