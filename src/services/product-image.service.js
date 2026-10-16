import { badRequest, notFound } from "../errors/app-error.js";
import { productRepository } from "../repositories/product.repository.js";
import { productOptionRepository } from "../repositories/product-option.repository.js";
import { productImageRepository } from "../repositories/product-image.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";
import { mediaAssetRepository } from "../repositories/media-asset.repository.js";
import { mediaAssetService } from "./media-asset.service.js";

const resolveMediaAsset = async (data, assetType, mediaAssets, client) => {
  if (!data?.media_asset_id) return data;
  const asset = await mediaAssets.findById(data.media_asset_id, client);
  if (!asset || asset.status === "deleted" || asset.asset_type !== assetType) {
    throw badRequest("INVALID_MEDIA_ASSET", "Media asset không hợp lệ hoặc không thuộc ngữ cảnh này");
  }
  return {
    ...data,
    url_product_image: asset.url,
    cloudinary_public_id: asset.cloudinary_public_id,
    cloudinary_source_public_id: asset.cloudinary_source_public_id,
    cloudinary_source_url: asset.cloudinary_source_url,
    crop_profile: asset.crop_profile,
    image_width: asset.image_width,
    image_height: asset.image_height,
    image_format: asset.image_format,
  };
};

export const createProductImageService = ({
  products = productRepository,
  options = productOptionRepository,
  images = productImageRepository,
  audits = auditRepository,
  mediaAssets = mediaAssetRepository,
  mediaLifecycle = mediaAssetService,
  transaction = withTransaction,
} = {}) => ({
  async getProductImages(productId) {
    const product = await products.findById(productId);
    if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
    return images.listByProduct(productId);
  },

  async createProductImage(productId, data, userId) {
    const product = await products.findById(productId);
    if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");

    if (data.product_option_value_id) {
      const optionValue = await options.findValueById(data.product_option_value_id);
      if (!optionValue || Number(optionValue.product_id) !== Number(productId)) {
        throw badRequest("INVALID_OPTION_VALUE", "Giá trị tùy chọn không thuộc về sản phẩm này");
      }
    }

    let position = data.position_product_image;
    if (position === undefined || position === null) {
      const maxPos = await images.getMaxPosition(productId);
      position = maxPos + 1;
    }

    return transaction(async (client) => {
      const mediaData = await resolveMediaAsset(data, "product", mediaAssets, client);
      const created = await images.create(productId, { ...mediaData, position_product_image: position }, client);
      if (mediaData.media_asset_id) {
        const attached = await mediaAssets.attach(mediaData.media_asset_id, "product_image", created.product_image_id, client);
        if (!attached) throw badRequest("MEDIA_ASSET_ATTACH_FAILED", "Không thể gắn media asset vào ảnh sản phẩm");
      }
      if (audits?.record) {
        await audits.record({
          userId,
          action: "create_product_image",
          entityName: "product_image",
          entityId: created.product_image_id,
          newData: created,
        }, client);
      }
      return created;
    });
  },

  async updateProductImage(imageId, data, userId) {
    const existing = await images.findById(imageId);
    if (!existing) throw notFound("IMAGE_NOT_FOUND", "Không tìm thấy hình ảnh sản phẩm");

    if (data.product_option_value_id) {
      const optionValue = await options.findValueById(data.product_option_value_id);
      if (!optionValue || Number(optionValue.product_id) !== Number(existing.product_id)) {
        throw badRequest("INVALID_OPTION_VALUE", "Giá trị tùy chọn không thuộc về sản phẩm này");
      }
    }

    const updated = await transaction(async (client) => {
      const mediaData = await resolveMediaAsset(data, "product", mediaAssets, client);
      const updated = await images.update(imageId, mediaData, client);
      if (mediaData.media_asset_id) {
        const attached = await mediaAssets.attach(mediaData.media_asset_id, "product_image", imageId, client);
        if (!attached) throw badRequest("MEDIA_ASSET_ATTACH_FAILED", "Không thể gắn media asset vào ảnh sản phẩm");
      }
      if (audits?.record) {
        await audits.record({
          userId,
          action: "update_product_image",
          entityName: "product_image",
          entityId: imageId,
          oldData: existing,
          newData: updated,
        }, client);
      }
      return updated;
    });
    if (existing.cloudinary_public_id && existing.cloudinary_public_id !== updated?.cloudinary_public_id) {
      await mediaLifecycle.cleanupAfterCommit(existing.cloudinary_public_id);
    }
    return updated;
  },

  async deleteProductImage(imageId, userId) {
    const existing = await images.findById(imageId);
    if (!existing) throw notFound("IMAGE_NOT_FOUND", "Không tìm thấy hình ảnh sản phẩm");

    const deleted = await transaction(async (client) => {
      await images.delete(imageId, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "delete_product_image",
          entityName: "product_image",
          entityId: imageId,
          oldData: existing,
        }, client);
      }
      return true;
    });
    if (deleted && existing.cloudinary_public_id) await mediaLifecycle.cleanupAfterCommit(existing.cloudinary_public_id);
    return deleted;
  },

  async reorderProductImages(productId, imageItems, userId) {
    const product = await products.findById(productId);
    if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");

    const imageIds = imageItems.map((img) => img.product_image_id);
    const dbImages = await images.findImagesByIds(imageIds);

    if (dbImages.length !== imageIds.length) {
      throw badRequest("INVALID_REORDER_IMAGES", "Danh sách chứa hình ảnh không tồn tại");
    }

    for (const dbImg of dbImages) {
      if (Number(dbImg.product_id) !== Number(productId)) {
        throw badRequest("INVALID_REORDER_IMAGES", "Danh sách chứa hình ảnh không thuộc sản phẩm này");
      }
    }

    return transaction(async (client) => {
      await images.updatePositions(imageItems, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "reorder_product_images",
          entityName: "product",
          entityId: productId,
          newData: { images: imageItems },
        }, client);
      }
      return images.listByProduct(productId, client);
    });
  },
});

const defaultProductImageService = createProductImageService();

export const {
  getProductImages,
  createProductImage,
  updateProductImage,
  deleteProductImage,
  reorderProductImages,
} = defaultProductImageService;
