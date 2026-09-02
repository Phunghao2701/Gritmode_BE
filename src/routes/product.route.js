import { Router } from "express";
import {
  getProducts,
  getAdminProducts,
  getProductById,
  getAdminProductById,
  publishProduct,
  archiveProduct,
  createProduct,
  createFullProduct,
  updateFullProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/product.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateBody, validateQuery } from "../middlewares/validate.middleware.js";
import {
  validateProductQuery,
  validateCreateProduct,
  validateCreateFullProduct,
  validateUpdateFullProduct,
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
 *   get:
 *     summary: Danh sách tất cả Product cho Admin, gồm draft/active/archived
 *     tags: [Admin Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status_product, schema: { type: string, enum: [draft, active, archived] } }
 *       - { in: query, name: search, schema: { type: string } }
 *     responses:
 *       200: { description: Admin product list }
 */
adminRouter.get("/", validateQuery(validateProductQuery), getAdminProducts);

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
 *               status_product:
 *                 type: string
 *                 enum: [draft]
 *                 readOnly: true
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
 * /admin/products/full:
 *   post:
 *     summary: Tạo đầy đủ sản phẩm trong một transaction (Admin)
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name_product, options, variants]
 *             properties:
 *               name_product: { type: string }
 *               description: { type: string, nullable: true }
 *               options:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name_option, values]
 *                   properties:
 *                     name_option: { type: string, example: Color }
 *                     values: { type: array, items: { type: string }, example: [Black, White] }
 *               variants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [sku, price, quantity_stock, option_values]
 *                   properties:
 *                     sku: { type: string }
 *                     price: { type: integer, minimum: 0 }
 *                     quantity_stock: { type: integer, minimum: 0 }
 *                     option_values: { type: object, additionalProperties: { type: string }, example: { Color: Black, Size: M } }
 *               category_ids: { type: array, items: { type: integer } }
 *               primary_category_id: { type: integer, nullable: true }
 *               collection_ids: { type: array, items: { type: integer } }
 *               images:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [url_product_image]
 *                   properties:
 *                     url_product_image: { type: string }
 *                     alt_product_image: { type: string, nullable: true }
 *                     position_product_image: { type: integer, minimum: 0 }
 *                     option_value:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         option_name: { type: string, example: Color }
 *                         value: { type: string, example: Black }
 *     responses:
 *       201: { description: Tạo toàn bộ sản phẩm thành công }
 *       400: { description: Dữ liệu không hợp lệ }
 *       404: { description: Danh mục không tồn tại }
 *       409: { description: SKU đã tồn tại }
 */
adminRouter.post("/full", validateBody(validateCreateFullProduct), createFullProduct);
adminRouter.put("/:productId/full", validateBody(validateUpdateFullProduct), updateFullProduct);
/**
 * @swagger
 * /admin/products/{productId}/publish:
 *   patch:
 *     summary: Validate completeness và publish Product Draft
 *     tags: [Admin Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: productId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Product active }
 *       409: { description: Product chưa đầy đủ hoặc sai trạng thái }
 */
adminRouter.patch("/:productId/publish", publishProduct);
/**
 * @swagger
 * /admin/products/{productId}/archive:
 *   patch:
 *     summary: Archive Product Active
 *     tags: [Admin Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: productId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Product archived }
 *       409: { description: Product không ở trạng thái active }
 */
adminRouter.patch("/:productId/archive", archiveProduct);
/**
 * @swagger
 * /admin/products/{productId}:
 *   get:
 *     summary: Chi tiết Product đầy đủ cho Admin Edit
 *     tags: [Admin Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: productId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Product với options, variants, inventory, images, categories và collections }
 */
adminRouter.get("/:productId", getAdminProductById);

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
