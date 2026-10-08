import { Router } from "express";
import { submitContactMessage } from "../controllers/contact.controller.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { validateContactMessage } from "../utils/validation.js";

const router = Router();

/**
 * @swagger
 * /contact:
 *   post:
 *     tags: [Contact]
 *     summary: Gửi tin nhắn đến bộ phận hỗ trợ Gritmode
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, email, message]
 *             properties:
 *               full_name: { type: string, minLength: 2, maxLength: 100 }
 *               email: { type: string, format: email }
 *               phone: { type: string, nullable: true }
 *               topic: { type: string, enum: [order_support, size_advice, product_feedback, product_question, partnership, other] }
 *               message: { type: string, minLength: 10, maxLength: 2000 }
 *     responses:
 *       200: { description: Tin nhắn đã được gửi }
 *       400: { description: Dữ liệu không hợp lệ }
 *       502: { description: Không thể gửi email hỗ trợ }
 */
router.post("/", validateBody(validateContactMessage), submitContactMessage);

export default router;
