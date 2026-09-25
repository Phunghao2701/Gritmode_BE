import { Router } from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  listAddresses,
  getAddress,
  createAddress,
  updateAddress,
  removeAddress,
  setDefaultAddress,
  listSessions,
  revokeSession,
  revokeAllSessions,
} from "../controllers/user.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import {
  validateCreateAddress,
  validateUpdateAddress,
  validateUpdateProfile,
  validatePasswordChange,
} from "../utils/validation.js";

const router = Router();
router.use(requireAuth);

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Lấy thông tin cá nhân của người dùng hiện tại
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin cá nhân
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 *       404:
 *         description: Không tìm thấy người dùng
 *   patch:
 *     summary: Cập nhật thông tin cá nhân
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               phone:
 *                 type: string
 *               url_image:
 *                 type: string
 *               date_of_birth:
 *                 type: string
 *                 format: date
 *               gender:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 *       403:
 *         description: Chứa trường bị cấm cập nhật
 *       409:
 *         description: Số điện thoại đã được sử dụng
 */
router.get("/me", getProfile);
router.patch("/me", validateBody(validateUpdateProfile), updateProfile);

/**
 * @swagger
 * /users/me/password:
 *   patch:
 *     summary: Không hỗ trợ với cơ chế đăng nhập passwordless OTP
 *     description: Endpoint legacy; hệ thống hiện không lưu mật khẩu.
 *     deprecated: true
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_password
 *               - new_password
 *             properties:
 *               current_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *     responses:
 *       400:
 *         description: PASSWORD_NOT_SUPPORTED vì hệ thống không lưu mật khẩu
 *       401:
 *         description: Chưa đăng nhập hoặc thiếu session_id hợp lệ
 */
router.patch("/me/password", validateBody(validatePasswordChange), changePassword);

/**
 * @swagger
 * /users/me/addresses:
 *   get:
 *     summary: Lấy danh sách địa chỉ nhận hàng của người dùng
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách địa chỉ
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 *   post:
 *     summary: Thêm mới địa chỉ nhận hàng
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receiver_name_user_address
 *               - phone_user_address
 *               - address_line_user_address
 *             properties:
 *               receiver_name_user_address:
 *                 type: string
 *               phone_user_address:
 *                 type: string
 *               address_line_user_address:
 *                 type: string
 *               ward_user_address:
 *                 type: string
 *               district_user_address:
 *                 type: string
 *               province_user_address:
 *                 type: string
 *               is_default:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Thêm địa chỉ thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 */
router.get("/me/addresses", listAddresses);
router.post("/me/addresses", validateBody(validateCreateAddress), createAddress);

/**
 * @swagger
 * /users/me/addresses/{addressId}:
 *   get:
 *     summary: Lấy chi tiết địa chỉ nhận hàng theo ID
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thông tin địa chỉ
 *       400:
 *         description: ID không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 *       404:
 *         description: Không tìm thấy địa chỉ
 *   patch:
 *     summary: Cập nhật địa chỉ nhận hàng
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
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
 *               receiver_name_user_address:
 *                 type: string
 *               phone_user_address:
 *                 type: string
 *               address_line_user_address:
 *                 type: string
 *               ward_user_address:
 *                 type: string
 *               district_user_address:
 *                 type: string
 *               province_user_address:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu hoặc ID không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 *       404:
 *         description: Không tìm thấy địa chỉ
 *   delete:
 *     summary: Xóa địa chỉ nhận hàng
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       400:
 *         description: ID không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 *       404:
 *         description: Không tìm thấy địa chỉ
 */
router.get("/me/addresses/:addressId", getAddress);
router.patch("/me/addresses/:addressId", validateBody(validateUpdateAddress), updateAddress);
router.delete("/me/addresses/:addressId", removeAddress);

/**
 * @swagger
 * /users/me/addresses/{addressId}/default:
 *   patch:
 *     summary: Đặt địa chỉ làm mặc định
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: ID không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 *       404:
 *         description: Không tìm thấy địa chỉ
 */
router.patch("/me/addresses/:addressId/default", setDefaultAddress);

/**
 * @swagger
 * /users/me/sessions:
 *   get:
 *     summary: Danh sách phiên đăng nhập
 *     tags:
 *       - Sessions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách phiên
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 *   delete:
 *     summary: Đăng xuất khỏi tất cả phiên khác
 *     tags:
 *       - Sessions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đã thu hồi các phiên khác
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 */
router.get("/me/sessions", listSessions);
router.delete("/me/sessions", revokeAllSessions);

/**
 * @swagger
 * /users/me/sessions/{sessionId}:
 *   delete:
 *     summary: Thu hồi phiên đăng nhập đơn lẻ
 *     tags:
 *       - Sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Đã thu hồi phiên
 *       400:
 *         description: ID không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 *       404:
 *         description: Không tìm thấy phiên
 */
router.delete("/me/sessions/:sessionId", revokeSession);

export default router;
