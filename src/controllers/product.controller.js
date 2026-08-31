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

  getProductById: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const getDetailMethod = service.getProductById || service.getById || service.findDetail;
      const data = await getDetailMethod.call(service, productId);
      return ok(res, data, { message: "Product retrieved successfully" });
    } catch (e) {
      next(e);
    }
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

  deleteProduct: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const deleteMethod = service.deleteProduct || service.delete;
      await deleteMethod.call(service, productId, req.user?.user_id);
      return ok(res, null, { code: "PRODUCT_DELETED", message: "Product deleted successfully" });
    } catch (e) {
      next(e);
    }
  },
});

const defaultProductController = createProductController();

export const getProducts = defaultProductController.getProducts;
export const getProductById = defaultProductController.getProductById;
export const createProduct = defaultProductController.createProduct;
export const updateProduct = defaultProductController.updateProduct;
export const deleteProduct = defaultProductController.deleteProduct;
