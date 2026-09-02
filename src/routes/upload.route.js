import { Router } from "express";
import multer from "multer";
import { mkdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { ok } from "../utils/api-response.js";

export const productUploadDirectory = resolve(process.cwd(), "uploads/products");
mkdirSync(productUploadDirectory, { recursive: true });

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.diskStorage({
    destination: productUploadDirectory,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, callback) => callback(allowedTypes.has(file.mimetype) ? null : new Error("Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP"), allowedTypes.has(file.mimetype)),
});

const router = Router();
router.use(requireAuth, requireRole("admin"));
router.post("/product-images", upload.array("images", 20), (req, res) => {
  const origin = `${req.protocol}://${req.get("host")}`;
  const images = (req.files || []).map((file) => ({
    url: `${origin}/uploads/products/${file.filename}`,
    original_name: file.originalname,
    size: file.size,
  }));
  return ok(res, images, { status: 201, code: "PRODUCT_IMAGES_UPLOADED", message: "Tải ảnh sản phẩm thành công" });
});

export default router;
