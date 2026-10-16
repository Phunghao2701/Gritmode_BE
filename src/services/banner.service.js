import { badRequest, notFound } from "../errors/app-error.js";
import { bannerRepository } from "../repositories/banner.repository.js";
import { mediaAssetRepository } from "../repositories/media-asset.repository.js";
import { mediaAssetService } from "./media-asset.service.js";
import { withTransaction } from "../config/database.js";
import { redisService } from "./redis.service.js";

const CACHE_KEY_ACTIVE_HERO = "cache:banners:active";
const CACHE_TTL_SECONDS = 1800;

export const createBannerService = ({ banners = bannerRepository, mediaAssets = mediaAssetRepository, mediaLifecycle = mediaAssetService, transaction = withTransaction, cache = redisService } = {}) => {
  const invalidate = async () => {
    try { await cache.del(CACHE_KEY_ACTIVE_HERO); } catch (err) { console.warn("[BannerService] cache invalidation failed:", err.message); }
  };

  const resolveAsset = async (payload, client) => {
    if (!payload.media_asset_id) return payload;
    const asset = await mediaAssets.findById(payload.media_asset_id, client);
    if (!asset || asset.status === "deleted" || asset.asset_type !== "banner") throw badRequest("INVALID_MEDIA_ASSET", "Media asset không hợp lệ cho banner");
    return {
      ...payload,
      image_url: asset.url,
      cloudinary_public_id: asset.cloudinary_public_id,
      cloudinary_source_public_id: asset.cloudinary_source_public_id,
      cloudinary_source_url: asset.cloudinary_source_url,
      crop_profile: asset.crop_profile,
      image_width: asset.image_width,
      image_height: asset.image_height,
      image_format: asset.image_format,
    };
  };

  return {
    async getActiveHeroData() {
      try {
        const cached = await cache.get(CACHE_KEY_ACTIVE_HERO);
        if (cached && typeof cached === "object") return cached;
      } catch (err) { console.warn("[BannerService] cache read failed:", err.message); }
      const [settings, slides] = await Promise.all([banners.getHeroSettings(), banners.listActive()]);
      const data = { settings, slides };
      try { await cache.set(CACHE_KEY_ACTIVE_HERO, data, CACHE_TTL_SECONDS); } catch (err) { console.warn("[BannerService] cache write failed:", err.message); }
      return data;
    },
    async getAdminHeroData() {
      const [settings, slides] = await Promise.all([banners.getHeroSettings(), banners.listAll()]);
      return { settings, slides };
    },
    async updateHeroContent(payload = {}) {
      const { subtitle, title, description, marquee_text } = payload;
      if (title !== undefined && (!title || typeof title !== "string" || !title.trim())) throw badRequest("INVALID_HERO_TITLE", "Tiêu đề Hero không được để trống");
      const updated = await banners.updateHeroSettings({
        subtitle: subtitle && typeof subtitle === "string" ? subtitle.trim() : undefined,
        title: title && typeof title === "string" ? title.trim() : undefined,
        description: description !== undefined ? String(description).trim() : undefined,
        marquee_text: marquee_text !== undefined ? String(marquee_text).trim() : undefined,
      });
      await invalidate();
      return updated;
    },
    async addHeroImage(payload = {}) {
      if (!payload.image_url || typeof payload.image_url !== "string" || !payload.image_url.trim()) throw badRequest("INVALID_BANNER_IMAGE", "Đường dẫn hình ảnh không được để trống");
      const created = await transaction(async (client) => {
        const data = await resolveAsset({ ...payload, image_url: payload.image_url.trim(), sort_order: Number.isInteger(Number(payload.sort_order)) ? Number(payload.sort_order) : 0, is_active: true }, client);
        const result = await banners.create(data, client);
        if (payload.media_asset_id) {
          const attached = await mediaAssets.attach(payload.media_asset_id, "banner", result.banner_id, client);
          if (!attached) throw badRequest("MEDIA_ASSET_ATTACH_FAILED", "Không thể gắn media asset vào banner");
        }
        return result;
      });
      await invalidate();
      return created;
    },
    async toggleImageStatus(bannerId, isActive) {
      const id = Number(bannerId);
      if (!id || id <= 0) throw badRequest("INVALID_BANNER_ID", "Mã ảnh không hợp lệ");
      if (!await banners.findById(id)) throw notFound("BANNER_NOT_FOUND", "Không tìm thấy ảnh slide");
      const updated = await banners.updateStatus(id, Boolean(isActive));
      await invalidate();
      return updated;
    },
    async updateHeroImage(bannerId, payload = {}) {
      const id = Number(bannerId);
      if (!id || id <= 0) throw badRequest("INVALID_BANNER_ID", "Mã ảnh không hợp lệ");
      const existing = await banners.findById(id);
      if (!existing) throw notFound("BANNER_NOT_FOUND", "Không tìm thấy ảnh slide");
      if (!payload.image_url || typeof payload.image_url !== "string" || !payload.image_url.trim()) {
        throw badRequest("INVALID_BANNER_IMAGE", "Đường dẫn hình ảnh không được để trống");
      }
      const updated = await transaction(async (client) => {
        const data = await resolveAsset({ ...payload, image_url: payload.image_url.trim() }, client);
        const result = await banners.updateImage(id, data, client);
        if (!result) throw notFound("BANNER_NOT_FOUND", "Không tìm thấy ảnh slide");
        if (payload.media_asset_id) {
          const attached = await mediaAssets.attach(payload.media_asset_id, "banner", id, client);
          if (!attached) throw badRequest("MEDIA_ASSET_ATTACH_FAILED", "Không thể gắn media asset vào banner");
        }
        return result;
      });
      if (existing.cloudinary_public_id && existing.cloudinary_public_id !== updated.cloudinary_public_id) {
        await mediaLifecycle.cleanupAfterCommit(existing.cloudinary_public_id);
      }
      await invalidate();
      return updated;
    },
    async updateImageOrder(bannerId, sortOrder) {
      const id = Number(bannerId);
      if (!id || id <= 0) throw badRequest("INVALID_BANNER_ID", "Mã ảnh không hợp lệ");
      const updated = await banners.updateSortOrder(id, Number(sortOrder) || 0);
      await invalidate();
      return updated;
    },
    async reorderImages(items = []) {
      if (!Array.isArray(items) || items.length === 0) throw badRequest("INVALID_BANNER_ORDER", "Danh sách thứ tự banner không hợp lệ");
      const normalized = items.map((item, index) => ({
        banner_id: Number(item.banner_id),
        sort_order: Number(item.sort_order ?? index),
      }));
      if (normalized.some((item) => !Number.isInteger(item.banner_id) || item.banner_id <= 0 || !Number.isInteger(item.sort_order) || item.sort_order < 0)) {
        throw badRequest("INVALID_BANNER_ORDER", "Thứ tự banner không hợp lệ");
      }
      const updated = await transaction(async (client) => {
        const existing = await banners.listAll(client);
        const existingIds = new Set(existing.map((item) => Number(item.banner_id)));
        if (normalized.length !== existingIds.size || normalized.some((item) => !existingIds.has(item.banner_id))) {
          throw badRequest("INVALID_BANNER_ORDER", "Danh sách thứ tự phải chứa đầy đủ banner hiện có");
        }
        const positions = new Set(normalized.map((item) => item.sort_order));
        if (positions.size !== normalized.length || Math.min(...positions) !== 0 || Math.max(...positions) !== normalized.length - 1) {
          throw badRequest("INVALID_BANNER_ORDER", "Thứ tự banner phải liên tục từ 0");
        }
        return banners.updateSortOrders(normalized, client);
      });
      await invalidate();
      return updated;
    },
    async deleteHeroImage(bannerId) {
      const id = Number(bannerId);
      if (!id || id <= 0) throw badRequest("INVALID_BANNER_ID", "Mã ảnh không hợp lệ");
      const existing = await banners.findById(id);
      if (!existing) throw notFound("BANNER_NOT_FOUND", "Không tìm thấy ảnh slide");
      await transaction(async (client) => {
        await banners.delete(id, client);
      });
      if (existing.cloudinary_public_id) await mediaLifecycle.cleanupAfterCommit(existing.cloudinary_public_id);
      await invalidate();
      return { success: true, banner_id: id };
    },
  };
};

const defaultBannerService = createBannerService();
export const getActiveHeroData = (...args) => defaultBannerService.getActiveHeroData(...args);
export const getAdminHeroData = (...args) => defaultBannerService.getAdminHeroData(...args);
export const updateHeroContent = (...args) => defaultBannerService.updateHeroContent(...args);
export const addHeroImage = (...args) => defaultBannerService.addHeroImage(...args);
export const toggleImageStatus = (...args) => defaultBannerService.toggleImageStatus(...args);
export const updateHeroImage = (...args) => defaultBannerService.updateHeroImage(...args);
export const updateImageOrder = (...args) => defaultBannerService.updateImageOrder(...args);
export const reorderImages = (...args) => defaultBannerService.reorderImages(...args);
export const deleteHeroImage = (...args) => defaultBannerService.deleteHeroImage(...args);
