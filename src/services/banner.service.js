import { badRequest, notFound } from "../errors/app-error.js";
import { bannerRepository } from "../repositories/banner.repository.js";
import { redisService } from "./redis.service.js";

const CACHE_KEY_ACTIVE_HERO = "cache:banners:active";
const CACHE_TTL_SECONDS = 1800; // 30 mins

export const getActiveHeroData = async () => {
  try {
    const cached = await redisService.get(CACHE_KEY_ACTIVE_HERO);
    if (cached && typeof cached === "object") {
      return cached;
    }
  } catch (err) {
    console.warn("[BannerService] Lỗi đọc Redis cache:", err.message);
  }

  const [settings, slides] = await Promise.all([
    bannerRepository.getHeroSettings(),
    bannerRepository.listActive(),
  ]);

  const data = { settings, slides };

  try {
    await redisService.set(CACHE_KEY_ACTIVE_HERO, data, CACHE_TTL_SECONDS);
  } catch (err) {
    console.warn("[BannerService] Lỗi ghi Redis cache:", err.message);
  }

  return data;
};

export const getAdminHeroData = async () => {
  const [settings, slides] = await Promise.all([
    bannerRepository.getHeroSettings(),
    bannerRepository.listAll(),
  ]);
  return { settings, slides };
};

export const updateHeroContent = async (payload = {}) => {
  const { subtitle, title, description, marquee_text } = payload;

  if (title !== undefined && (!title || typeof title !== "string" || !title.trim())) {
    throw badRequest("Tiêu đề Hero không được để trống");
  }

  const updatedSettings = await bannerRepository.updateHeroSettings({
    subtitle: subtitle && typeof subtitle === "string" ? subtitle.trim() : undefined,
    title: title && typeof title === "string" ? title.trim() : undefined,
    description: description !== undefined ? String(description).trim() : undefined,
    marquee_text: marquee_text !== undefined ? String(marquee_text).trim() : undefined,
  });

  try {
    await redisService.del(CACHE_KEY_ACTIVE_HERO);
  } catch (err) {
    console.warn("[BannerService] Lỗi xóa Redis cache:", err.message);
  }

  return updatedSettings;
};

export const addHeroImage = async (payload = {}) => {
  const { image_url, sort_order } = payload;

  if (!image_url || typeof image_url !== "string" || !image_url.trim()) {
    throw badRequest("Đường dẫn hình ảnh không được để trống");
  }

  const createdSlide = await bannerRepository.create({
    image_url: image_url.trim(),
    sort_order: Number.isInteger(Number(sort_order)) ? Number(sort_order) : 0,
    is_active: true,
  });

  try {
    await redisService.del(CACHE_KEY_ACTIVE_HERO);
  } catch (err) {
    console.warn("[BannerService] Lỗi xóa Redis cache:", err.message);
  }

  return createdSlide;
};

export const toggleImageStatus = async (bannerId, isActive) => {
  const id = Number(bannerId);
  if (!id || id <= 0) throw badRequest("Mã ảnh không hợp lệ");

  const existing = await bannerRepository.findById(id);
  if (!existing) throw notFound("Không tìm thấy ảnh slide");

  const updated = await bannerRepository.updateStatus(id, Boolean(isActive));

  try {
    await redisService.del(CACHE_KEY_ACTIVE_HERO);
  } catch (err) {
    console.warn("[BannerService] Lỗi xóa Redis cache:", err.message);
  }

  return updated;
};

export const updateImageOrder = async (bannerId, sortOrder) => {
  const id = Number(bannerId);
  if (!id || id <= 0) throw badRequest("Mã ảnh không hợp lệ");

  const order = Number(sortOrder) || 0;
  const updated = await bannerRepository.updateSortOrder(id, order);

  try {
    await redisService.del(CACHE_KEY_ACTIVE_HERO);
  } catch (err) {
    console.warn("[BannerService] Lỗi xóa Redis cache:", err.message);
  }

  return updated;
};

export const deleteHeroImage = async (bannerId) => {
  const id = Number(bannerId);
  if (!id || id <= 0) throw badRequest("Mã ảnh không hợp lệ");

  const existing = await bannerRepository.findById(id);
  if (!existing) throw notFound("Không tìm thấy ảnh slide");

  await bannerRepository.delete(id);

  try {
    await redisService.del(CACHE_KEY_ACTIVE_HERO);
  } catch (err) {
    console.warn("[BannerService] Lỗi xóa Redis cache:", err.message);
  }

  return { success: true, banner_id: id };
};
