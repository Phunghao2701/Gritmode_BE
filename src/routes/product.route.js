import { Router } from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/product.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateBody, validateQuery } from "../middlewares/validate.middleware.js";
import {
  validateProductQuery,
  validateCreateProduct,
  validateUpdateProduct,
} from "../utils/validation.js";

// Public product routes
const publicRouter = Router();

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Lấy danh sách sản phẩm (tìm kiếm, lọc, sắp xếp, phân trang)
 *     tags:
 *       - Products
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: collection_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: min_price
 *         schema:
 *           type: number
 *       - in: query
 *         name: max_price
 *         schema:
 *           type: number
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest, price_asc, price_desc, name_asc, name_desc]
 *           default: newest
 *     responses:
 *       200:
 *         description: Danh sách sản phẩm
 *       400:
 *         description: Tham số truy vấn không hợp lệ
 */
publicRouter.get("/", validateQuery(validateProductQuery), getProducts);

/**
 * @swagger
 * /products/{productId}:
 *   get:
 *     summary: Lấy thông tin chi tiết sản phẩm
 *     tags:
 *       - Products
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chi tiết sản phẩm
 *       404:
 *         description: Không tìm thấy sản phẩm
 */
publicRouter.get("/:productId", getProductById);

// Admin product routes
const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));

/**
 * @swagger
 * /admin/products:
 *   post:
 *     summary: Tạo mới sản phẩm (Admin)
 *     tags:
 *       - Admin Products
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name_product
 *             properties:
 *               name_product:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tạo sản phẩm thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập (Admin only)
 */
adminRouter.post("/", validateBody(validateCreateProduct), createProduct);

/**
 * @swagger
 * /admin/products/{productId}:
 *   patch:
 *     summary: Cập nhật thông tin sản phẩm (Admin)
 *     tags:
 *       - Admin Products
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
 *             properties:
 *               name_product:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật sản phẩm thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền truy cập (Admin only)
 *       404:
 *         description: Không tìm thấy sản phẩm
 *   delete:
 *     summary: Xóa sản phẩm (Admin)
 *     tags:
 *       - Admin Products
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
 *         description: Xóa sản phẩm thành công
 *       403:
 *         description: Không có quyền truy cập (Admin only)
 *       404:
 *         description: Không tìm thấy sản phẩm
 *       409:
 *         description: Sản phẩm không thể xóa do có dữ liệu liên kết
 */
adminRouter.patch("/:productId", validateBody(validateUpdateProduct), updateProduct);
adminRouter.delete("/:productId", deleteProduct);

export { publicRouter as productRouter, adminRouter as adminProductRouter };
export default publicRouter;
