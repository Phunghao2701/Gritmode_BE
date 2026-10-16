import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { ok } from "../utils/api-response.js";
import { getImageProfile } from "../utils/image-profiles.js";
import { withTransaction } from "../config/database.js";
import { cloudinaryAssetService } from "../services/cloudinary-asset.service.js";
import { mediaAssetService } from "../services/media-asset.service.js";
import { mediaAssetRepository } from "../repositories/media-asset.repository.js";
import { badRequest } from "../errors/app-error.js";

const MAX_IMAGE_DIMENSION = 2000;
const WEBP_QUALITY = 85;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

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

const router = Router();
router.use(requireAuth, requireRole("admin"));
router.post("/product-images", upload.array("images", 20), async (req, res) => {
  const files = req.files || [];
  const profile = String(req.body?.profile || "").trim();
  try {
    getImageProfile(profile);
  } catch {
    throw badRequest("INVALID_IMAGE_PROFILE", "Image profile không hợp lệ");
  }
  const descriptors = [];
  const images = [];
  try {
    for (const file of files) {
      const descriptor = await cloudinaryAssetService.upload({ buffer: file.buffer, profile, originalName: file.originalname });
      descriptors.push(descriptor);
      const asset = await withTransaction((client) => mediaAssetRepository.create({ ...descriptor, asset_type: profile }, client));
      images.push({ ...descriptor, media_asset_id: asset.media_asset_id });
    }
  } catch (error) {
    await Promise.all(descriptors.map(async (descriptor) => {
      await mediaAssetService.compensateUpload(descriptor).catch(() => {});
      const asset = await mediaAssetRepository.findByPublicId(descriptor.cloudinary_public_id).catch(() => null);
      if (asset) await mediaAssetRepository.markDeleted(descriptor.cloudinary_public_id).catch(() => {});
    }));
    throw error;
  }
  return ok(res, images, { status: 201, code: "PRODUCT_IMAGES_UPLOADED", message: "Tải ảnh sản phẩm thành công" });
});

export default router;
