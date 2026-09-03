import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { ok } from "../utils/api-response.js";

const MAX_IMAGE_DIMENSION = 2000;
const WEBP_QUALITY = 85;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, callback) => callback(allowedTypes.has(file.mimetype) ? null : new Error("Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP"), allowedTypes.has(file.mimetype)),
});

export const optimizeProductImage = (buffer) => sharp(buffer)
  .rotate()
  .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
  .webp({ quality: 80, effort: 2 })
  .toBuffer();

const uploadToCloudinary = (buffer) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder: "gritmode/products", resource_type: "image" },
    (error, result) => error ? reject(error) : resolve(result),
  );
  stream.end(buffer);
});

const router = Router();
router.use(requireAuth, requireRole("admin"));
router.post("/product-images", upload.array("images", 20), async (req, res) => {
  const files = req.files || [];
  const images = await Promise.all(
    files.map(async (file) => {
      const optimized = await optimizeProductImage(file.buffer);
      const result = await uploadToCloudinary(optimized);
      return {
        url: result.secure_url,
        public_id: result.public_id,
        original_name: file.originalname,
        size: result.bytes,
      };
    })
  );
  return ok(res, images, { status: 201, code: "PRODUCT_IMAGES_UPLOADED", message: "Tải ảnh sản phẩm thành công" });
});

export default router;
