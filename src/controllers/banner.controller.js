import { ok, created } from "../utils/api-response.js";
import * as bannerService from "../services/banner.service.js";

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
      const data = await service.updateHeroContent(req.body);
      return ok(res, data, { message: "Cập nhật tiêu đề, mô tả và marquee thành công" });
    } catch (err) {
      next(err);
    }
  },

  addHeroImage: async (req, res, next) => {
    try {
      const data = await service.addHeroImage(req.body);
      return created(res, data, { message: "Thêm ảnh slide mới thành công" });
    } catch (err) {
      next(err);
    }
  },

  toggleImageStatus: async (req, res, next) => {
    try {
      const data = await service.toggleImageStatus(req.params.id, req.body?.is_active);
      return ok(res, data, { message: "Cập nhật trạng thái hiển thị ảnh thành công" });
    } catch (err) {
      next(err);
    }
  },

  updateImageOrder: async (req, res, next) => {
    try {
      const data = await service.updateImageOrder(req.params.id, req.body?.sort_order);
      return ok(res, data, { message: "Cập nhật thứ tự ảnh thành công" });
    } catch (err) {
      next(err);
    }
  },

  deleteHeroImage: async (req, res, next) => {
    try {
      const data = await service.deleteHeroImage(req.params.id);
      return ok(res, data, { message: "Xóa ảnh slide thành công" });
    } catch (err) {
      next(err);
    }
  },
});

export const bannerController = createBannerController();
