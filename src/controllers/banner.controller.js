import { ok, created } from "../utils/api-response.js";
import * as bannerService from "../services/banner.service.js";

const getBannerId = (req) => req.validatedParams?.id ?? req.params.id;

export const createBannerController = ({ service = bannerService } = {}) => ({
  getActiveHero: async (req, res, next) => {
    try {
      const data = await service.getActiveHeroData();
      res.setHeader("Cache-Control", "public, max-age=5, stale-while-revalidate=30");
      return ok(res, data, { message: "Lấy dữ liệu Hero trang chủ thành công" });
    } catch (err) {
      next(err);
    }
  },

  getAdminHero: async (req, res, next) => {
    try {
      const data = await service.getAdminHeroData();
      return ok(res, data, { message: "Lấy cấu hình Hero quản trị thành công" });
    } catch (err) {
      next(err);
    }
  },

  updateHeroContent: async (req, res, next) => {
    try {
      const data = await service.updateHeroContent(req.validatedBody || req.body);
      return ok(res, data, { message: "Cập nhật tiêu đề, mô tả và marquee thành công" });
    } catch (err) {
      next(err);
    }
  },

  addHeroImage: async (req, res, next) => {
    try {
      const data = await service.addHeroImage(req.validatedBody || req.body);
      return created(res, data, { message: "Thêm ảnh slide mới thành công" });
    } catch (err) {
      next(err);
    }
  },

  toggleImageStatus: async (req, res, next) => {
    try {
      const data = await service.toggleImageStatus(getBannerId(req), (req.validatedBody || req.body)?.is_active);
      return ok(res, data, { message: "Cập nhật trạng thái hiển thị ảnh thành công" });
    } catch (err) {
      next(err);
    }
  },

  updateHeroImage: async (req, res, next) => {
    try {
      const data = await service.updateHeroImage(getBannerId(req), req.validatedBody || req.body);
      return ok(res, data, { message: "Cập nhật ảnh banner thành công" });
    } catch (err) {
      next(err);
    }
  },

  cropHeroImage: async (req, res, next) => {
    try {
      const data = await service.cropHeroImage(getBannerId(req), {
        buffer: req.file?.buffer,
        originalName: req.file?.originalname,
      });
      return ok(res, data, { code: "BANNER_IMAGE_CROPPED", message: "Cập nhật ảnh banner thành công" });
    } catch (err) {
      next(err);
    }
  },

  updateImageOrder: async (req, res, next) => {
    try {
      const data = await service.updateImageOrder(getBannerId(req), (req.validatedBody || req.body)?.sort_order);
      return ok(res, data, { message: "Cập nhật thứ tự ảnh thành công" });
    } catch (err) {
      next(err);
    }
  },

  reorderImages: async (req, res, next) => {
    try {
      const data = await service.reorderImages((req.validatedBody || req.body)?.items);
      return ok(res, data, { message: "Cập nhật thứ tự banner thành công" });
    } catch (err) {
      next(err);
    }
  },

  deleteHeroImage: async (req, res, next) => {
    try {
      const data = await service.deleteHeroImage(getBannerId(req));
      return ok(res, data, { message: "Xóa ảnh slide thành công" });
    } catch (err) {
      next(err);
    }
  },
});

export const bannerController = createBannerController();
