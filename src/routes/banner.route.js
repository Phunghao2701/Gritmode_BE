import { Router } from "express";
import { bannerController } from "../controllers/banner.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

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
adminBannerRouter.put("/content", bannerController.updateHeroContent);
adminBannerRouter.post("/images", bannerController.addHeroImage);
adminBannerRouter.patch("/images/:id/status", bannerController.toggleImageStatus);
adminBannerRouter.patch("/images/:id/order", bannerController.updateImageOrder);
adminBannerRouter.delete("/images/:id", bannerController.deleteHeroImage);
