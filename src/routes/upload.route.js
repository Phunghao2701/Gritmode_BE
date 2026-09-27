import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { storageService } from "../services/storage.service.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { ok } from "../utils/api-response.js";

const MAX_IMAGE_DIMENSION = 2000;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, callback) =>
    callback(
      allowedTypes.has(file.mimetype)
        ? null
        : new Error("Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP"),
      allowedTypes.has(file.mimetype)
    ),
});

export const optimizeProductImage = (buffer) =>
  sharp(buffer)
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80, effort: 2 })
    .toBuffer();

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.post("/product-images", upload.array("images", 20), async (req, res, next) => {
  try {
    const files = req.files || [];
    const images = await Promise.all(
      files.map(async (file) => {
        const optimized = await optimizeProductImage(file.buffer);
        const result = await storageService.uploadFile({
          buffer: optimized,
          originalName: file.originalname,
          mimeType: "image/webp",
          folder: "products",
        });
        return {
          url: result.url,
          public_id: result.public_id,
          original_name: file.originalname,
          size: result.size,
        };
      })
    );
    return ok(res, images, {
      status: 201,
      code: "PRODUCT_IMAGES_UPLOADED",
      message: "Tải ảnh sản phẩm thành công",
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
