import { validatePositiveId } from "../utils/validation.js";
import { ok } from "../utils/api-response.js";
import * as productService from "../services/product.service.js";
import { categoryRepository } from "../repositories/category.repository.js";
import { collectionRepository } from "../repositories/collection.repository.js";
import { redisService } from "../services/redis.service.js";

// In-process memory cache (Tier 1: <1ms instant response)
const memCacheProducts = new Map();
const MEM_TTL_PRODUCT_DETAIL = 10 * 60 * 1000; // 10 minutes
const MEM_TTL_PRODUCT_LIST = 5 * 60 * 1000; // 5 minutes

export const clearProductMemoryCache = () => {
  memCacheProducts.clear();
};

export const createProductController = ({ service = productService } = {}) => ({
  getProductMeta: async (req, res, next) => {
    try {
      const now = Date.now();
      const memHit = memCacheProducts.get("products:meta");
      if (memHit && memHit.expiry > now) {
        res.setHeader("X-Cache", "MEM-HIT");
        res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=1800");
        return ok(res, memHit.data, { message: "Lấy metadata sản phẩm thành công" });
      }

      const { data, isCached } = await redisService.getOrSet("products:meta", async () => {
        const [categories, collections] = await Promise.all([
          categoryRepository.listActive ? categoryRepository.listActive() : [],
          collectionRepository.listVisible ? collectionRepository.listVisible() : (collectionRepository.list ? collectionRepository.list() : []),
        ]);
        return { categories, collections };
      }, 1800);

      if (data) {
        memCacheProducts.set("products:meta", { data, expiry: now + MEM_TTL_PRODUCT_LIST });
      }

      if (isCached) res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=1800");
      return ok(res, data, { message: "Lấy metadata sản phẩm thành công" });
    } catch (e) {
      next(e);
    }
  },

  getProducts: async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query || {};
      const cacheKey = `products:list:${JSON.stringify(query)}`;
      const now = Date.now();
      const memHit = memCacheProducts.get(cacheKey);
      if (memHit && memHit.expiry > now) {
        res.setHeader("X-Cache", "MEM-HIT");
        res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
        return ok(res, memHit.data, { message: "Products retrieved successfully" });
      }

      const { data, isCached } = await redisService.getOrSet(cacheKey, async () => {
        const getProductsMethod = service.getProducts || service.list;
        return getProductsMethod.call(service, query);
      }, 900);

      if (data) {
        memCacheProducts.set(cacheKey, { data, expiry: now + MEM_TTL_PRODUCT_LIST });
      }

      if (isCached) res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
      return ok(res, data, { message: "Products retrieved successfully" });
    } catch (e) {
      next(e);
    }
  },

  getAdminProducts: async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query || {};
      const cacheKey = `admin:products:list:${JSON.stringify(query)}`;
      const { data, isCached } = await redisService.getOrSet(cacheKey, async () => {
        return service.getAdminProducts(query);
      }, 120);
      if (isCached) res.setHeader("X-Cache", "HIT");
      return ok(res, data, { message: "Admin products retrieved successfully" });
    } catch (e) { next(e); }
  },

  getProductById: async (req, res, next) => {
    try {
      const identifier = req.params.productId;
      const cacheKey = `products:detail:${identifier}`;
      const now = Date.now();
      const memHit = memCacheProducts.get(cacheKey);
      if (memHit && memHit.expiry > now) {
        res.setHeader("X-Cache", "MEM-HIT");
        res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
        return ok(res, memHit.data, { message: "Product retrieved successfully" });
      }

      const { data, isCached } = await redisService.getOrSet(cacheKey, async () => {
        return /^\d+$/.test(identifier)
          ? await service.getProductById(Number(identifier))
          : service.getProductBySlug
          ? await service.getProductBySlug(identifier)
          : await service.getProductById(validatePositiveId(identifier));
      }, 1800);

      if (data) {
        memCacheProducts.set(cacheKey, { data, expiry: now + MEM_TTL_PRODUCT_DETAIL });
        if (data.product_id && String(data.product_id) !== String(identifier)) {
          memCacheProducts.set(`products:detail:${data.product_id}`, { data, expiry: now + MEM_TTL_PRODUCT_DETAIL });
        }
        if (data.slug_product && data.slug_product !== identifier) {
          memCacheProducts.set(`products:detail:${data.slug_product}`, { data, expiry: now + MEM_TTL_PRODUCT_DETAIL });
        }
      }

      if (isCached) res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
      return ok(res, data, { message: "Product retrieved successfully" });
    } catch (e) {
      next(e);
    }
  },

  getAdminProductById: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const cacheKey = `admin:products:detail:${productId}`;
      const { data, isCached } = await redisService.getOrSet(cacheKey, async () => {
        return service.getAdminProductById(productId);
      }, 600);
      if (isCached) res.setHeader("X-Cache", "HIT");
      return ok(res, data, { message: "Admin product retrieved successfully" });
    } catch (e) { next(e); }
  },

  publishProduct: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.publishProduct(productId, req.user?.user_id);
      clearProductMemoryCache();
      await Promise.all([
        redisService.delByPattern("products:*"),
        redisService.delByPattern("admin:products:*"),
        redisService.delByPattern("dashboard:*"),
      ]);
      return ok(res, data, { code: "PRODUCT_PUBLISHED", message: "Product published successfully" });
    } catch (e) { next(e); }
  },

  archiveProduct: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.archiveProduct(productId, req.user?.user_id);
      clearProductMemoryCache();
      await Promise.all([
        redisService.delByPattern("products:*"),
        redisService.delByPattern("admin:products:*"),
        redisService.delByPattern("dashboard:*"),
      ]);
      return ok(res, data, { code: "PRODUCT_ARCHIVED", message: "Product archived successfully" });
    } catch (e) { next(e); }
  },

  createProduct: async (req, res, next) => {
    try {
      const createMethod = service.createProduct || service.create;
      const data = await createMethod.call(service, req.validatedBody || req.body, req.user?.user_id);
      clearProductMemoryCache();
      await Promise.all([
        redisService.delByPattern("products:*"),
        redisService.delByPattern("admin:products:*"),
        redisService.delByPattern("dashboard:*"),
      ]);
      return ok(res, data, { status: 201, code: "PRODUCT_CREATED", message: "Product created successfully" });
    } catch (e) {
      next(e);
    }
  },

  createFullProduct: async (req, res, next) => {
    try {
      const data = await service.createFullProduct(req.validatedBody || req.body, req.user?.user_id);
      clearProductMemoryCache();
      await Promise.all([
        redisService.delByPattern("products:*"),
        redisService.delByPattern("admin:products:*"),
        redisService.delByPattern("dashboard:*"),
      ]);
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
      clearProductMemoryCache();
      await Promise.all([
        redisService.delByPattern("products:*"),
        redisService.delByPattern("admin:products:*"),
        redisService.delByPattern("dashboard:*"),
      ]);
      return ok(res, data, { code: "PRODUCT_UPDATED", message: "Product updated successfully" });
    } catch (e) {
      next(e);
    }
  },

  updateFullProduct: async (req, res, next) => {
    try {
      const productId = validatePositiveId(req.params.productId);
      const data = await service.updateFullProduct(productId, req.validatedBody || req.body, req.user?.user_id);
      clearProductMemoryCache();
      await Promise.all([
        redisService.delByPattern("products:*"),
        redisService.delByPattern("admin:products:*"),
        redisService.delByPattern("dashboard:*"),
      ]);
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
      clearProductMemoryCache();
      await Promise.all([
        redisService.delByPattern("products:*"),
        redisService.delByPattern("admin:products:*"),
        redisService.delByPattern("dashboard:*"),
      ]);
      return ok(res, data, { code: "PRODUCT_ARCHIVED", message: "Product archived successfully" });
    } catch (e) {
      next(e);
    }
  },
});

const defaultProductController = createProductController();

export const getProductMeta = defaultProductController.getProductMeta;
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
