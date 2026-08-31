import { Router } from "express";
import {
  getProductOptions,
  createProductOption,
  updateProductOption,
  deleteProductOption,
  createOptionValue,
  updateOptionValue,
  deleteOptionValue,
} from "../controllers/product-option.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import {
  validateCreateProductOption,
  validateUpdateProductOption,
  validateCreateOptionValue,
  validateUpdateOptionValue,
} from "../utils/validation.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

/**
 * @swagger
 * /admin/products/{productId}/options:
 *   get:
 *     summary: Lấy danh sách Option và Option Value của sản phẩm (Admin)
 *     tags:
 *       - Admin Product Options
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
 *         description: Danh sách Option và Value
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy sản phẩm
 *   post:
 *     summary: Tạo mới Option cho sản phẩm (Admin)
 *     tags:
 *       - Admin Product Options
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
 *               - name_option
 *             properties:
 *               name_option:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tạo Option thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy sản phẩm
 *       409:
 *         description: Option đã tồn tại trong sản phẩm
 */
router.get("/products/:productId/options", getProductOptions);
router.post("/products/:productId/options", validateBody(validateCreateProductOption), createProductOption);

/**
 * @swagger
 * /admin/product-options/{optionId}:
 *   patch:
 *     summary: Cập nhật Option (Admin)
 *     tags:
 *       - Admin Product Options
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: optionId
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
 *               - name_option
 *             properties:
 *               name_option:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy Option
 *       409:
 *         description: Tên Option trùng lặp trong cùng sản phẩm
 *   delete:
 *     summary: Xóa Option (Admin)
 *     tags:
 *       - Admin Product Options
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: optionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa Option thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy Option
 *       409:
 *         description: Option đang được sử dụng bởi các biến thể sản phẩm
 */
router.patch("/product-options/:optionId", validateBody(validateUpdateProductOption), updateProductOption);
router.delete("/product-options/:optionId", deleteProductOption);

/**
 * @swagger
 * /admin/product-options/{optionId}/values:
 *   post:
 *     summary: Tạo mới Option Value (Admin)
 *     tags:
 *       - Admin Product Option Values
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: optionId
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
 *               - value_option
 *             properties:
 *               value_option:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tạo Option Value thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy Option
 *       409:
 *         description: Option Value đã tồn tại trong Option
 */
router.post("/product-options/:optionId/values", validateBody(validateCreateOptionValue), createOptionValue);

/**
 * @swagger
 * /admin/product-option-values/{valueId}:
 *   patch:
 *     summary: Cập nhật Option Value (Admin)
 *     tags:
 *       - Admin Product Option Values
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: valueId
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
 *               - value_option
 *             properties:
 *               value_option:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật Option Value thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy Option Value
 *       409:
 *         description: Trùng lặp giá trị trong cùng Option
 *   delete:
 *     summary: Xóa Option Value (Admin)
 *     tags:
 *       - Admin Product Option Values
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: valueId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa Option Value thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy Option Value
 *       409:
 *         description: Option Value đang được sử dụng bởi các biến thể sản phẩm
 */
router.patch("/product-option-values/:valueId", validateBody(validateUpdateOptionValue), updateOptionValue);
router.delete("/product-option-values/:valueId", deleteOptionValue);

export default router;
