import { Router } from "express";
import {
  getCollections,
  getAdminCollections,
  getCollectionById,
  getAdminCollectionById,
  getProductsByCollection,
  createCollection,
  updateCollection,
  updateCollectionStatus,
  deleteCollection,
  addProductToCollection,
  removeProductFromCollection,
  reorderCollectionProducts,
} from "../controllers/collection.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateBody, validateQuery } from "../middlewares/validate.middleware.js";
import {
  validateCreateCollection,
  validateUpdateCollection,
  validateUpdateCollectionStatus,
  validateAddProductToCollection,
  validateReorderCollectionProducts,
  validateProductQuery,
} from "../utils/validation.js";

export const publicCollectionRouter = Router();

/**
 * @swagger
 * /collections:
 *   get:
 *     summary: Lấy danh sách bộ sưu tập đang hiển thị (Public)
 *     tags:
 *       - Collections
 *     responses:
 *       200:
 *         description: Danh sách bộ sưu tập
 */
publicCollectionRouter.get("/", getCollections);

/**
 * @swagger
 * /collections/{collectionId}:
 *   get:
 *     summary: Lấy chi tiết bộ sưu tập (Public)
 *     tags:
 *       - Collections
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chi tiết bộ sưu tập
 *       404:
 *         description: Không tìm thấy bộ sưu tập
 */
publicCollectionRouter.get("/:collectionId", getCollectionById);

/**
 * @swagger
 * /collections/{collectionId}/products:
 *   get:
 *     summary: Lấy danh sách sản phẩm trong bộ sưu tập (Public)
 *     tags:
 *       - Collections
 *     parameters:
 *       - in: path
 *         name: collectionId
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
 *         description: Không tìm thấy bộ sưu tập
 */
publicCollectionRouter.get("/:collectionId/products", validateQuery(validateProductQuery), getProductsByCollection);

export const adminCollectionRouter = Router();
adminCollectionRouter.use(requireAuth, requireRole("admin"));

/**
 * @swagger
 * /admin/collections:
 *   get:
 *     summary: Lấy toàn bộ bộ sưu tập (Admin)
 *     tags:
 *       - Admin Collections
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách bộ sưu tập kèm trạng thái hiển thị
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *   post:
 *     summary: Tạo mới bộ sưu tập (Admin)
 *     tags:
 *       - Admin Collections
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name_collection
 *             properties:
 *               name_collection:
 *                 type: string
 *               slug_collection:
 *                 type: string
 *               description_collection:
 *                 type: string
 *               image_collection:
 *                 type: string
 *               position_collection:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 *               start_at:
 *                 type: string
 *                 format: date-time
 *               end_at:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Tạo bộ sưu tập thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc khoảng thời gian sai
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       409:
 *         description: Slug bộ sưu tập đã tồn tại
 */
adminCollectionRouter.get("/collections", getAdminCollections);
adminCollectionRouter.post("/collections", validateBody(validateCreateCollection), createCollection);

/**
 * @swagger
 * /admin/collections/{collectionId}:
 *   get:
 *     summary: Lấy chi tiết bộ sưu tập cho Admin (Admin)
 *     tags:
 *       - Admin Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chi tiết bộ sưu tập kèm thống kê
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy bộ sưu tập
 *   patch:
 *     summary: Cập nhật bộ sưu tập (Admin)
 *     tags:
 *       - Admin Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
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
 *               name_collection:
 *                 type: string
 *               slug_collection:
 *                 type: string
 *               description_collection:
 *                 type: string
 *               image_collection:
 *                 type: string
 *               position_collection:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 *               start_at:
 *                 type: string
 *                 format: date-time
 *               end_at:
 *                 type: string
 *                 format: date-time
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
 *         description: Không tìm thấy bộ sưu tập
 *       409:
 *         description: Slug bộ sưu tập bị trùng
 *   delete:
 *     summary: Xóa / vô hiệu hóa bộ sưu tập (Admin)
 *     tags:
 *       - Admin Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Vô hiệu hóa thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy bộ sưu tập
 */
adminCollectionRouter.get("/collections/:collectionId", getAdminCollectionById);
adminCollectionRouter.patch("/collections/:collectionId", validateBody(validateUpdateCollection), updateCollection);
adminCollectionRouter.delete("/collections/:collectionId", deleteCollection);

/**
 * @swagger
 * /admin/collections/{collectionId}/status:
 *   patch:
 *     summary: Bật / tắt trạng thái hoạt động bộ sưu tập (Admin)
 *     tags:
 *       - Admin Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
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
 *         description: Không tìm thấy bộ sưu tập
 */
adminCollectionRouter.patch("/collections/:collectionId/status", validateBody(validateUpdateCollectionStatus), updateCollectionStatus);

/**
 * @swagger
 * /admin/collections/{collectionId}/products:
 *   post:
 *     summary: Thêm sản phẩm vào bộ sưu tập (Admin)
 *     tags:
 *       - Admin Collection Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
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
 *               product_id:
 *                 type: integer
 *               position_product_collection:
 *                 type: integer
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product_id:
 *                       type: integer
 *                     position_product_collection:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Thêm sản phẩm vào bộ sưu tập thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy bộ sưu tập hoặc sản phẩm
 *       409:
 *         description: Sản phẩm đã thuộc bộ sưu tập
 */
adminCollectionRouter.post("/collections/:collectionId/products", validateBody(validateAddProductToCollection), addProductToCollection);

/**
 * @swagger
 * /admin/collections/{collectionId}/products/{productId}:
 *   delete:
 *     summary: Xóa sản phẩm khỏi bộ sưu tập (Admin)
 *     tags:
 *       - Admin Collection Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa sản phẩm khỏi bộ sưu tập thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy bộ sưu tập, sản phẩm hoặc liên kết
 */
adminCollectionRouter.delete("/collections/:collectionId/products/:productId", removeProductFromCollection);

/**
 * @swagger
 * /admin/collections/{collectionId}/products/reorder:
 *   patch:
 *     summary: Sắp xếp thứ tự sản phẩm trong bộ sưu tập (Admin)
 *     tags:
 *       - Admin Collection Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
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
 *               - products
 *             properties:
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - product_id
 *                     - position_product_collection
 *                   properties:
 *                     product_id:
 *                       type: integer
 *                     position_product_collection:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Sắp xếp thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Quyền Admin bị từ chối
 *       404:
 *         description: Không tìm thấy bộ sưu tập hoặc sản phẩm
 */
adminCollectionRouter.patch("/collections/:collectionId/products/reorder", validateBody(validateReorderCollectionProducts), reorderCollectionProducts);
