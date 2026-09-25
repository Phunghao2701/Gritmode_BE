import { Router } from "express";
import {
  getProductImages,
  createProductImage,
  updateProductImage,
  deleteProductImage,
  reorderProductImages,
} from "../controllers/product-image.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import {
  validateCreateProductImage,
  validateUpdateProductImage,
  validateReorderProductImages,
} from "../utils/validation.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

/**
 * @swagger
 * /admin/products/{productId}/images:
 *   get:
 *     summary: Lấy danh sách hình ảnh của sản phẩm (Admin)
 *     tags:
 *       - Admin Product Images
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
 *         description: Danh sách hình ảnh
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy sản phẩm
 *   post:
 *     summary: Thêm hình ảnh mới cho sản phẩm (Admin)
 *     tags:
 *       - Admin Product Images
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
 *               - url_product_image
 *             properties:
 *               url_product_image:
 *                 type: string
 *               product_option_value_id:
 *                 type: integer
 *                 nullable: true
 *               alt_product_image:
 *                 type: string
 *                 nullable: true
 *               position_product_image:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Thêm ảnh thành công
 *       400:
 *         description: Dữ liệu hoặc Option Value không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy sản phẩm
 */
router.get("/products/:productId/images", getProductImages);
router.post("/products/:productId/images", validateBody(validateCreateProductImage), createProductImage);

/**
 * @swagger
 * /admin/products/{productId}/images/reorder:
 *   patch:
 *     summary: Sắp xếp lại thứ tự hình ảnh của sản phẩm (Admin)
 *     tags:
 *       - Admin Product Images
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
 *               - images
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - product_image_id
 *                     - position_product_image
 *                   properties:
 *                     product_image_id:
 *                       type: integer
 *                     position_product_image:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Sắp xếp thành công
 *       400:
 *         description: Dữ liệu reorder không hợp lệ hoặc chứa ảnh không thuộc sản phẩm
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy sản phẩm
 */
router.patch("/products/:productId/images/reorder", validateBody(validateReorderProductImages), reorderProductImages);

/**
 * @swagger
 * /admin/product-images/{imageId}:
 *   patch:
 *     summary: Cập nhật thông tin hình ảnh (Admin)
 *     tags:
 *       - Admin Product Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: imageId
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
 *               url_product_image:
 *                 type: string
 *               product_option_value_id:
 *                 type: integer
 *                 nullable: true
 *               alt_product_image:
 *                 type: string
 *                 nullable: true
 *               position_product_image:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu hoặc Option Value không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy hình ảnh
 *   delete:
 *     summary: Xóa hình ảnh sản phẩm (Admin)
 *     tags:
 *       - Admin Product Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy hình ảnh
 */
router.patch("/product-images/:imageId", validateBody(validateUpdateProductImage), updateProductImage);
router.delete("/product-images/:imageId", deleteProductImage);

export default router;
