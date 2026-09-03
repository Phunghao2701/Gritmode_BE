import { validatePositiveId } from "../utils/validation.js";
import { ok } from "../utils/api-response.js";
import * as productService from "../services/product.service.js";

export const createProductController = ({ service = productService } = {}) => ({
  getProducts: async (req, res, next) => {
    try {
      const getProductsMethod = service.getProducts || service.list;
      const data = await getProductsMethod.call(service, req.validatedQuery || req.query);
      return ok(res, data, { message: "Products retrieved successfully" });
    } catch (e) {
      next(e);
    }
  },

  getAdminProducts: async (req, res, next) => {
    try {
      const data = await service.getAdminProducts(req.validatedQuery || req.query);
      return ok(res, data, { message: "Admin products retrieved successfully" });
    } catch (e) { next(e); }
  },

  getProductById: async (req, res, next) => {
    try {
      const identifier = req.params.productId;
      const data = /^\d+$/.test(identifier)
        ? await service.getProductById(Number(identifier))
        : service.getProductBySlug
        ? await service.getProductBySlug(identifier)
        : await service.getProductById(validatePositiveId(identifier));
      return ok(res, data, { message: "Product retrieved successfully" });
    } catch (e) {
      next(e);
    }
  },

  getAdminProductById: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.getAdminProductById(productId);
      return ok(res, data, { message: "Admin product retrieved successfully" });
    } catch (e) { next(e); }
  },

  publishProduct: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.publishProduct(productId, req.user?.user_id);
      return ok(res, data, { code: "PRODUCT_PUBLISHED", message: "Product published successfully" });
    } catch (e) { next(e); }
  },

  archiveProduct: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.archiveProduct(productId, req.user?.user_id);
      return ok(res, data, { code: "PRODUCT_ARCHIVED", message: "Product archived successfully" });
    } catch (e) { next(e); }
  },

  createProduct: async (req, res, next) => {
    try {
      const createMethod = service.createProduct || service.create;
      const data = await createMethod.call(service, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { status: 201, code: "PRODUCT_CREATED", message: "Product created successfully" });
    } catch (e) {
      next(e);
    }
  },

  createFullProduct: async (req, res, next) => {
    try {
      const data = await service.createFullProduct(req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { status: 201, code: "FULL_PRODUCT_CREATED", message: "Full product created successfully" });
    } catch (e) {
      next(e);
    }
  },

  updateProduct: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const updateMethod = service.updateProduct || service.update;
      const data = await updateMethod.call(service, productId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { code: "PRODUCT_UPDATED", message: "Product updated successfully" });
    } catch (e) {
      next(e);
    }
  },

  updateFullProduct: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.updateFullProduct(productId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { code: "FULL_PRODUCT_UPDATED", message: "Full product updated successfully" });
    } catch (e) {
      next(e);
    }
  },

  deleteProduct: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const deleteMethod = service.deleteProduct || service.delete;
      const data = await deleteMethod.call(service, productId, req.user?.user_id);
      return ok(res, data, { code: "PRODUCT_ARCHIVED", message: "Product archived successfully" });
    } catch (e) {
      next(e);
    }
  },
});

const defaultProductController = createProductController();

export const getProducts = defaultProductController.getProducts;
export const getAdminProducts = defaultProductController.getAdminProducts;
export const getProductById = defaultProductController.getProductById;
export const getAdminProductById = defaultProductController.getAdminProductById;
export const publishProduct = defaultProductController.publishProduct;
export const archiveProduct = defaultProductController.archiveProduct;
export const createProduct = defaultProductController.createProduct;
export const createFullProduct = defaultProductController.createFullProduct;
export const updateProduct = defaultProductController.updateProduct;
export const updateFullProduct = defaultProductController.updateFullProduct;
export const deleteProduct = defaultProductController.deleteProduct;
