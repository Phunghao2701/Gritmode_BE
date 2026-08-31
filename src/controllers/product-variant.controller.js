import { validatePositiveId } from "../utils/validation.js";
import { ok } from "../utils/api-response.js";
import * as productVariantService from "../services/product-variant.service.js";

export const createProductVariantController = ({
  service = productVariantService,
} = {}) => ({
  getProductVariants: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.getProductVariants(productId);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  getProductVariantById: async (req, res, next) => {
    try {
      const variantId = validatePositiveId(req.params.variantId);
      const data = await service.getProductVariantById(variantId);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  createProductVariant: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.createProductVariant(productId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { status: 201, code: "VARIANT_CREATED" });
    } catch (e) {
      next(e);
    }
  },

  updateProductVariant: async (req, res, next) => {
    try {
      const variantId = validatePositiveId(req.params.variantId);
      const data = await service.updateProductVariant(variantId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { code: "VARIANT_UPDATED" });
    } catch (e) {
      next(e);
    }
  },

  deleteProductVariant: async (req, res, next) => {
    try {
      const variantId = validatePositiveId(req.params.variantId);
      await service.deleteProductVariant(variantId, req.user?.user_id);
      return ok(res, null, { code: "VARIANT_DELETED" });
    } catch (e) {
      next(e);
    }
  },
});

const defaultProductVariantController = createProductVariantController();

export const {
  getProductVariants,
  getProductVariantById,
  createProductVariant,
  updateProductVariant,
  deleteProductVariant,
} = defaultProductVariantController;
