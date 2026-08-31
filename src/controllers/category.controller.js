import { validatePositiveId } from "../utils/validation.js";
import { ok } from "../utils/api-response.js";
import * as categoryService from "../services/category.service.js";

export const createCategoryController = ({
  service = categoryService,
} = {}) => ({
  getCategories: async (req, res, next) => {
    try {
      const data = await service.getCategories();
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  getAdminCategories: async (req, res, next) => {
    try {
      const data = await service.getAdminCategories(req.query);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  getCategoryById: async (req, res, next) => {
    try {
      const categoryId = validatePositiveId(req.params.categoryId);
      const data = await service.getCategoryById(categoryId, req.user?.role === "admin");
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  getProductsByCategory: async (req, res, next) => {
    try {
      const categoryId = validatePositiveId(req.params.categoryId);
      const data = await service.getProductsByCategory(categoryId, req.query);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  createCategory: async (req, res, next) => {
    try {
      const data = await service.createCategory(req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { status: 201, code: "CATEGORY_CREATED" });
    } catch (e) {
      next(e);
    }
  },

  updateCategory: async (req, res, next) => {
    try {
      const categoryId = validatePositiveId(req.params.categoryId);
      const data = await service.updateCategory(categoryId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { code: "CATEGORY_UPDATED" });
    } catch (e) {
      next(e);
    }
  },

  deleteCategory: async (req, res, next) => {
    try {
      const categoryId = validatePositiveId(req.params.categoryId);
      await service.deleteCategory(categoryId, req.user?.user_id);
      return ok(res, null, { code: "CATEGORY_DELETED" });
    } catch (e) {
      next(e);
    }
  },

  updateCategoryStatus: async (req, res, next) => {
    try {
      const categoryId = validatePositiveId(req.params.categoryId);
      const isActive = (req.validatedBody || req.body).is_active;
      const data = await service.updateCategoryStatus(categoryId, isActive, req.user?.user_id);
      return ok(res, data, { code: "CATEGORY_STATUS_UPDATED" });
    } catch (e) {
      next(e);
    }
  },

  assignProductCategory: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.assignProductCategory(productId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { status: 201, code: "PRODUCT_CATEGORY_ASSIGNED" });
    } catch (e) {
      next(e);
    }
  },

  removeProductCategory: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const categoryId = validatePositiveId(req.params.categoryId);
      await service.removeProductCategory(productId, categoryId, req.user?.user_id);
      return ok(res, null, { code: "PRODUCT_CATEGORY_REMOVED" });
    } catch (e) {
      next(e);
    }
  },

  setPrimaryCategory: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const categoryId = validatePositiveId(req.params.categoryId);
      const data = await service.setPrimaryCategory(productId, categoryId, req.user?.user_id);
      return ok(res, data, { code: "PRIMARY_CATEGORY_SET" });
    } catch (e) {
      next(e);
    }
  },
});

const defaultCategoryController = createCategoryController();

export const {
  getCategories,
  getAdminCategories,
  getCategoryById,
  getProductsByCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryStatus,
  assignProductCategory,
  removeProductCategory,
  setPrimaryCategory,
} = defaultCategoryController;
