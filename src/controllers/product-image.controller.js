import { validatePositiveId } from "../utils/validation.js";
import { ok } from "../utils/api-response.js";
import * as productImageService from "../services/product-image.service.js";

export const createProductImageController = ({
  service = productImageService,
} = {}) => ({
  getProductImages: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.getProductImages(productId);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  createProductImage: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.createProductImage(productId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { status: 201, code: "IMAGE_CREATED" });
    } catch (e) {
      next(e);
    }
  },

  updateProductImage: async (req, res, next) => {
    try {
      const imageId = validatePositiveId(req.params.imageId);
      const data = await service.updateProductImage(imageId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { code: "IMAGE_UPDATED" });
    } catch (e) {
      next(e);
    }
  },

  deleteProductImage: async (req, res, next) => {
    try {
      const imageId = validatePositiveId(req.params.imageId);
      await service.deleteProductImage(imageId, req.user?.user_id);
      return ok(res, null, { code: "IMAGE_DELETED" });
    } catch (e) {
      next(e);
    }
  },

  reorderProductImages: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const images = (req.validatedBody || req.body).images;
      const data = await service.reorderProductImages(productId, images, req.user?.user_id);
      return ok(res, data, { code: "IMAGES_REORDERED" });
    } catch (e) {
      next(e);
    }
  },
});

const defaultProductImageController = createProductImageController();

export const {
  getProductImages,
  createProductImage,
  updateProductImage,
  deleteProductImage,
  reorderProductImages,
} = defaultProductImageController;
