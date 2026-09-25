import { Router } from "express";
import {
  getCategories,
  getAdminCategories,
  getCategoryById,
  getProductsByCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryStatus,
  assignProductCategory,
  removeProductCategory,
  setPrimaryCategory,
} from "../controllers/category.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateBody, validateQuery } from "../middlewares/validate.middleware.js";
import {
  validateCreateCategory,
  validateUpdateCategory,
  validateUpdateCategoryStatus,
  validateAssignProductCategory,
  validateProductQuery,
} from "../utils/validation.js";

export const publicCategoryRouter = Router();

/**
 * @swagger
 * /categories:
 *   get:
 *     summary: Lấy cây danh mục sản phẩm (Public)
 *     tags:
 *       - Categories
 *     responses:
 *       200:
 *         description: Danh sách danh mục dạng cây
 */
publicCategoryRouter.get("/", getCategories);

/**
 * @swagger
 * /categories/{categoryId}:
 *   get:
 *     summary: Lấy chi tiết danh mục sản phẩm (Public)
 *     tags:
 *       - Categories
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chi tiết danh mục
 *       404:
 *         description: Không tìm thấy danh mục
 */
publicCategoryRouter.get("/:categoryId", getCategoryById);

/**
 * @swagger
 * /categories/{categoryId}/products:
 *   get:
 *     summary: Lấy danh sách sản phẩm theo danh mục (Public)
 *     tags:
 *       - Categories
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
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
 *     responses:
 *       200:
 *         description: Danh sách sản phẩm phân trang
 *       404:
 *         description: Không tìm thấy danh mục
 */
publicCategoryRouter.get("/:categoryId/products", validateQuery(validateProductQuery), getProductsByCategory);

export const adminCategoryRouter = Router();
adminCategoryRouter.use(requireAuth, requireRole("admin"));

/**
 * @swagger
 * /admin/categories:
 *   get:
 *     summary: Lấy toàn bộ danh mục sản phẩm (Admin)
 *     tags:
 *       - Admin Categories
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách toàn bộ danh mục
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *   post:
 *     summary: Tạo mới danh mục (Admin)
 *     tags:
 *       - Admin Categories
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name_category
 *             properties:
 *               name_category:
 *                 type: string
 *               slug_category:
 *                 type: string
 *               parent_category_id:
 *                 type: integer
 *                 nullable: true
 *               description_category:
 *                 type: string
 *                 nullable: true
 *               position_category:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Tạo danh mục thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Danh mục cha không tồn tại
 *       409:
 *         description: Slug danh mục đã tồn tại
 */
adminCategoryRouter.get("/categories", getAdminCategories);
adminCategoryRouter.post("/categories", validateBody(validateCreateCategory), createCategory);

/**
 * @swagger
 * /admin/categories/{categoryId}:
 *   patch:
 *     summary: Cập nhật danh mục (Admin)
 *     tags:
 *       - Admin Categories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
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
 *               name_category:
 *                 type: string
 *               slug_category:
 *                 type: string
 *               parent_category_id:
 *                 type: integer
 *                 nullable: true
 *               description_category:
 *                 type: string
 *                 nullable: true
 *               position_category:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc tạo vòng lặp danh mục
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy danh mục hoặc danh mục cha
 *       409:
 *         description: Slug danh mục bị trùng
 *   delete:
 *     summary: Xóa / vô hiệu hóa danh mục (Admin)
 *     tags:
 *       - Admin Categories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa / vô hiệu hóa thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy danh mục
 */
adminCategoryRouter.patch("/categories/:categoryId", validateBody(validateUpdateCategory), updateCategory);
adminCategoryRouter.delete("/categories/:categoryId", deleteCategory);

/**
 * @swagger
 * /admin/categories/{categoryId}/status:
 *   patch:
 *     summary: Bật / tắt trạng thái hoạt động danh mục (Admin)
 *     tags:
 *       - Admin Categories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
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
 *               - is_active
 *             properties:
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy danh mục
 */
adminCategoryRouter.patch("/categories/:categoryId/status", validateBody(validateUpdateCategoryStatus), updateCategoryStatus);

/**
 * @swagger
 * /admin/products/{productId}/categories:
 *   post:
 *     summary: Gán sản phẩm vào danh mục (Admin)
 *     tags:
 *       - Admin Product Categories
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
 *               category_id:
 *                 type: integer
 *               is_primary:
 *                 type: boolean
 *               categories:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     category_id:
 *                       type: integer
 *                     is_primary:
 *                       type: boolean
 *     responses:
 *       201:
 *         description: Gán danh mục thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy sản phẩm hoặc danh mục
 *       409:
 *         description: Sản phẩm đã thuộc danh mục này
 */
adminCategoryRouter.post("/products/:productId/categories", validateBody(validateAssignProductCategory), assignProductCategory);

/**
 * @swagger
 * /admin/products/{productId}/categories/{categoryId}:
 *   delete:
 *     summary: Xóa sản phẩm khỏi danh mục (Admin)
 *     tags:
 *       - Admin Product Categories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa sản phẩm khỏi danh mục thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy sản phẩm, danh mục hoặc liên kết
 */
adminCategoryRouter.delete("/products/:productId/categories/:categoryId", removeProductCategory);

/**
 * @swagger
 * /admin/products/{productId}/categories/{categoryId}/primary:
 *   patch:
 *     summary: Đặt danh mục chính cho sản phẩm (Admin)
 *     tags:
 *       - Admin Product Categories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Đặt danh mục chính thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy sản phẩm, danh mục hoặc liên kết
 */
adminCategoryRouter.patch("/products/:productId/categories/:categoryId/primary", setPrimaryCategory);
