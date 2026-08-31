import { validatePositiveId } from "../utils/validation.js";
import { ok } from "../utils/api-response.js";
import * as collectionService from "../services/collection.service.js";

export const createCollectionController = ({
  service = collectionService,
} = {}) => ({
  getCollections: async (req, res, next) => {
    try {
      const data = await service.getCollections();
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  getAdminCollections: async (req, res, next) => {
    try {
      const data = await service.getAdminCollections(req.query);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  getCollectionById: async (req, res, next) => {
    try {
      const collectionId = validatePositiveId(req.params.collectionId);
      const data = await service.getCollectionById(collectionId, req.user?.role === "admin");
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  getAdminCollectionById: async (req, res, next) => {
    try {
      const collectionId = validatePositiveId(req.params.collectionId);
      const data = await service.getCollectionById(collectionId, true);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  getProductsByCollection: async (req, res, next) => {
    try {
      const collectionId = validatePositiveId(req.params.collectionId);
      const data = await service.getProductsByCollection(collectionId, req.query, req.user?.role === "admin");
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  createCollection: async (req, res, next) => {
    try {
      const data = await service.createCollection(req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { status: 201, code: "COLLECTION_CREATED" });
    } catch (e) {
      next(e);
    }
  },

  updateCollection: async (req, res, next) => {
    try {
      const collectionId = validatePositiveId(req.params.collectionId);
      const data = await service.updateCollection(collectionId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { code: "COLLECTION_UPDATED" });
    } catch (e) {
      next(e);
    }
  },

  updateCollectionStatus: async (req, res, next) => {
    try {
      const collectionId = validatePositiveId(req.params.collectionId);
      const isActive = (req.validatedBody || req.body).is_active;
      const data = await service.updateCollectionStatus(collectionId, isActive, req.user?.user_id);
      return ok(res, data, { code: "COLLECTION_STATUS_UPDATED" });
    } catch (e) {
      next(e);
    }
  },

  deleteCollection: async (req, res, next) => {
    try {
      const collectionId = validatePositiveId(req.params.collectionId);
      await service.deleteCollection(collectionId, req.user?.user_id);
      return ok(res, null, { code: "COLLECTION_DELETED" });
    } catch (e) {
      next(e);
    }
  },

  addProductToCollection: async (req, res, next) => {
    try {
      const collectionId = validatePositiveId(req.params.collectionId);
      const data = await service.addProductToCollection(collectionId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { status: 201, code: "COLLECTION_PRODUCT_ADDED" });
    } catch (e) {
      next(e);
    }
  },

  removeProductFromCollection: async (req, res, next) => {
    try {
      const collectionId = validatePositiveId(req.params.collectionId);
      const productId = validatePositiveId(req.params.productId);
      await service.removeProductFromCollection(collectionId, productId, req.user?.user_id);
      return ok(res, null, { code: "COLLECTION_PRODUCT_REMOVED" });
    } catch (e) {
      next(e);
    }
  },

  reorderCollectionProducts: async (req, res, next) => {
    try {
      const collectionId = validatePositiveId(req.params.collectionId);
      const data = await service.reorderCollectionProducts(collectionId, req.validatedBody || req.body, req.user?.user_id);
      return ok(res, data, { code: "COLLECTION_PRODUCTS_REORDERED" });
    } catch (e) {
      next(e);
    }
  },
});

const defaultCollectionController = createCollectionController();

export const {
  getCollections,
  getAdminCollections,
  getCollectionById,
  getAdminCollectionById,
  getProductsByCollection,
  createCollection,
  updateCollection,
  updateCollectionStatus,
  deleteCollection,
  addProductToCollection,
  removeProductFromCollection,
  reorderCollectionProducts,
} = defaultCollectionController;
