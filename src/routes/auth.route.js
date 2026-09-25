import { Router } from "express";
import { requestOtp, verifyOtp, googleLogin, refresh, logout, me } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { validateGoogleLogin, validateRequestOtp, validateVerifyOtp } from "../utils/validation.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Passwordless Email OTP Authentication & Session APIs
 */

/**
 * @swagger
 * /auth/request-otp:
 *   post:
 *     summary: Gửi mã OTP xác thực qua Email
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: customer@gmail.com
 *     responses:
 *       200:
 *         description: Mã OTP đã được gửi đến email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 code:
 *                   type: string
 *                   example: OTP_SENT
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     expired_in:
 *                       type: integer
 *                       example: 300
 *       400:
 *         description: Email không hợp lệ
 *       429:
 *         description: Yêu cầu gửi OTP quá thường xuyên (Rate limit 60s)
 */
router.post("/request-otp", validateBody(validateRequestOtp), requestOtp);

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Xác thực OTP (Tự động đăng ký / đăng nhập & cấp Tokens)
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: customer@gmail.com
 *               otp:
 *                 type: string
 *                 example: "483921"
 *               guest_token:
 *                 type: string
 *                 example: "guest_abc123"
 *                 nullable: true
 *                 description: Guest token để tự động gộp giỏ hàng khách
 *     responses:
 *       200:
 *         description: Xác thực thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 code:
 *                   type: string
 *                   example: AUTHENTICATED
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     is_new_user:
 *                       type: boolean
 *                       example: false
 *                     access_token:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         user_id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *                         status:
 *                           type: string
 *       400:
 *         description: Dữ liệu OTP hoặc email không đúng định dạng
 *       401:
 *         description: Mã OTP không hợp lệ hoặc đã hết hạn
 *       403:
 *         description: Tài khoản đã bị khóa hoặc chưa kích hoạt
 *       429:
 *         description: Đã thử OTP sai quá 5 lần
 */
router.post("/verify-otp", validateBody(validateVerifyOtp), verifyOtp);

router.post("/google", validateBody(validateGoogleLogin), googleLogin);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Làm mới Access Token bằng Refresh Token (Token Rotation)
 *     tags:
 *       - Auth
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Làm mới token thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 code:
 *                   type: string
 *                   example: TOKEN_REFRESHED
 *                 data:
 *                   type: object
 *                   properties:
 *                     access_token:
 *                       type: string
 *       401:
 *         description: Refresh token không hợp lệ hoặc đã hết hạn
 */
router.post("/refresh", refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Đăng xuất và thu hồi Refresh Token của phiên hiện tại
 *     tags:
 *       - Auth
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 */
router.post("/logout", logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Lấy thông tin danh tính của người dùng hiện tại
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin người dùng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 code:
 *                   type: string
 *                   example: USER_PROFILE
 *                 data:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     status:
 *                       type: string
 *       401:
 *         description: Chưa đăng nhập hoặc Token không hợp lệ
 */
router.get("/me", requireAuth, me);

export default router;
