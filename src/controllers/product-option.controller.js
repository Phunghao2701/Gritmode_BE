import { validatePositiveId } from "../utils/validation.js";
import { ok } from "../utils/api-response.js";
import * as productOptionService from "../services/product-option.service.js";

export const createProductOptionController = ({
  service = productOptionService,
} = {}) => ({
  getProductOptions: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.getProductOptions(productId);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  createProductOption: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.createProductOption(productId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { status: 201, code: "OPTION_CREATED" });
    } catch (e) {
      next(e);
    }
  },

  updateProductOption: async (req, res, next) => {
    try {
      const optionId = validatePositiveId(req.params.optionId);
      const data = await service.updateProductOption(optionId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { code: "OPTION_UPDATED" });
    } catch (e) {
      next(e);
    }
  },

  deleteProductOption: async (req, res, next) => {
    try {
      const optionId = validatePositiveId(req.params.optionId);
      await service.deleteProductOption(optionId, req.user?.user_id);
      return ok(res, null, { code: "OPTION_DELETED" });
    } catch (e) {
      next(e);
    }
  },

  createOptionValue: async (req, res, next) => {
    try {
      const optionId = validatePositiveId(req.params.optionId);
      const data = await service.createOptionValue(optionId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { status: 201, code: "OPTION_VALUE_CREATED" });
    } catch (e) {
      next(e);
    }
  },

  updateOptionValue: async (req, res, next) => {
    try {
      const valueId = validatePositiveId(req.params.valueId);
      const data = await service.updateOptionValue(valueId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { code: "OPTION_VALUE_UPDATED" });
    } catch (e) {
      next(e);
    }
  },

  deleteOptionValue: async (req, res, next) => {
    try {
      const valueId = validatePositiveId(req.params.valueId);
      await service.deleteOptionValue(valueId, req.user?.user_id);
      return ok(res, null, { code: "OPTION_VALUE_DELETED" });
    } catch (e) {
      next(e);
    }
  },
});

const defaultProductOptionController = createProductOptionController();

export const {
  getProductOptions,
  createProductOption,
  updateProductOption,
  deleteProductOption,
  createOptionValue,
  updateOptionValue,
  deleteOptionValue,
} = defaultProductOptionController;
