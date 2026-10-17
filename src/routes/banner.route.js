import { Router } from "express";
import { bannerController } from "../controllers/banner.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { imageUpload } from "../middlewares/image-upload.middleware.js";
import { validateBody, validateParam } from "../middlewares/validate.middleware.js";
import {
  validatePositiveId,
  validateBannerImagePayload,
  validateBannerOrderPayload,
  validateBannerSortOrderPayload,
  validateBannerStatusPayload,
  validateHeroContent,
} from "../utils/validation.js";

export const publicBannerRouter = Router();

/**
 * Public routes: Lấy dữ liệu Hero (tiêu đề, mô tả, marquee, danh sách slide active)
 */
publicBannerRouter.get("/", bannerController.getActiveHero);
publicBannerRouter.get("/active", bannerController.getActiveHero);

export const adminBannerRouter = Router();

// Toàn bộ route admin yêu cầu xác thực và role admin
adminBannerRouter.use(requireAuth, requireRole("admin"));

/**
 * Admin routes: Quản trị Hero settings & Slide images
 */
adminBannerRouter.get("/", bannerController.getAdminHero);
adminBannerRouter.put("/content", validateBody(validateHeroContent), bannerController.updateHeroContent);
adminBannerRouter.post("/images", validateBody(validateBannerImagePayload), bannerController.addHeroImage);
adminBannerRouter.patch("/images/order", validateBody(validateBannerOrderPayload), bannerController.reorderImages);
adminBannerRouter.patch(
  "/images/:id/status",
  validateParam("id", validatePositiveId),
  validateBody(validateBannerStatusPayload),
  bannerController.toggleImageStatus,
);
adminBannerRouter.patch(
  "/images/:id",
  validateParam("id", validatePositiveId),
  validateBody(validateBannerImagePayload),
  bannerController.updateHeroImage,
);
adminBannerRouter.post(
  "/images/:id/crop",
  validateParam("id", validatePositiveId),
  imageUpload.single("image"),
  bannerController.cropHeroImage,
);
adminBannerRouter.patch(
  "/images/:id/order",
  validateParam("id", validatePositiveId),
  validateBody(validateBannerSortOrderPayload),
  bannerController.updateImageOrder,
);
adminBannerRouter.delete(
  "/images/:id",
  validateParam("id", validatePositiveId),
  bannerController.deleteHeroImage,
);
