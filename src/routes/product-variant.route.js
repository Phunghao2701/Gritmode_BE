import { Router } from "express";
import {
  getProductVariants,
  getProductVariantById,
  createProductVariant,
  updateProductVariant,
  deleteProductVariant,
} from "../controllers/product-variant.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import {
  validateCreateVariant,
  validateUpdateVariant,
} from "../utils/validation.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

/**
 * @swagger
 * /admin/products/{productId}/variants:
 *   get:
 *     summary: Lấy danh sách Variant của sản phẩm (Admin)
 *     tags:
 *       - Admin Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Danh sách biến thể
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy sản phẩm
 *   post:
 *     summary: Tạo mới Variant cho sản phẩm (Admin)
 *     tags:
 *       - Admin Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sku
 *               - price
 *               - option_value_ids
 *             properties:
 *               sku:
 *                 type: string
 *               price:
 *                 type: number
 *               option_value_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       201:
 *         description: Tạo biến thể thành công
 *       400:
 *         description: Dữ liệu hoặc tổ hợp Option không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy sản phẩm
 *       409:
 *         description: SKU đã tồn tại hoặc tổ hợp Option bị trùng lặp
 */
router.get("/products/:productId/variants", getProductVariants);
router.post("/products/:productId/variants", validateBody(validateCreateVariant), createProductVariant);

/**
 * @swagger
 * /admin/product-variants/{variantId}:
 *   get:
 *     summary: Lấy thông tin chi tiết Variant (Admin)
 *     tags:
 *       - Admin Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chi tiết biến thể
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy biến thể
 *   patch:
 *     summary: Cập nhật thông tin Variant (Admin)
 *     tags:
 *       - Admin Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sku:
 *                 type: string
 *               price:
 *                 type: number
 *               option_value_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Cập nhật biến thể thành công
 *       400:
 *         description: Dữ liệu hoặc tổ hợp Option không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy biến thể
 *       409:
 *         description: SKU trùng lặp hoặc tổ hợp Option bị trùng
 *   delete:
 *     summary: Xóa Variant (Admin)
 *     tags:
 *       - Admin Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa biến thể thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy biến thể
 *       409:
 *         description: Biến thể không thể xóa do có dữ liệu đơn hàng hoặc giỏ hàng liên kết
 */
router.get("/product-variants/:variantId", getProductVariantById);
router.patch("/product-variants/:variantId", validateBody(validateUpdateVariant), updateProductVariant);
router.delete("/product-variants/:variantId", deleteProductVariant);

export default router;
