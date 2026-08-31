import { badRequest, conflict, notFound } from "../errors/app-error.js";
import { collectionRepository } from "../repositories/collection.repository.js";
import { productRepository } from "../repositories/product.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";
import { slugify } from "../utils/validation.js";
import { getProducts } from "./product.service.js";

export const isCollectionVisible = (collection, now = new Date()) => {
  if (!collection) return false;
  if (collection.is_active === false) return false;
  if (collection.start_at && new Date(collection.start_at) > now) return false;
  if (collection.end_at && new Date(collection.end_at) < now) return false;
  return true;
};

export const getCollectionDisplayStatus = (collection, now = new Date()) => {
  if (!collection) return "inactive";
  if (collection.is_active === false) return "inactive";
  if (collection.start_at && new Date(collection.start_at) > now) return "scheduled";
  if (collection.end_at && new Date(collection.end_at) < now) return "expired";
  return "active";
};

export const createCollectionService = ({
  collections = collectionRepository,
  products = productRepository,
  audits = auditRepository,
  transaction = withTransaction,
  productListing = getProducts,
} = {}) => ({
  async getCollections() {
    const list = await collections.listVisible();
    return list.map((item) => ({
      collection_id: item.collection_id,
      name_collection: item.name_collection,
      slug_collection: item.slug_collection,
      description_collection: item.description_collection,
      image_collection: item.image_collection,
      position_collection: item.position_collection,
      start_at: item.start_at,
      end_at: item.end_at,
    }));
  },

  async getAdminCollections(filter = {}) {
    const list = await collections.listAll(filter);
    const mapped = list.map((item) => ({
      ...item,
      display_status: getCollectionDisplayStatus(item),
    }));

    if (filter.status) {
      return mapped.filter((item) => item.display_status === filter.status);
    }
    return mapped;
  },

  async getCollectionById(collectionId, isAdmin = false) {
    const collection = await collections.findById(collectionId);
    if (!collection) throw notFound("COLLECTION_NOT_FOUND", "Không tìm thấy bộ sưu tập");
    if (!isAdmin && !isCollectionVisible(collection)) {
      throw notFound("COLLECTION_NOT_FOUND", "Không tìm thấy bộ sưu tập");
    }

    if (isAdmin) {
      return {
        ...collection,
        display_status: getCollectionDisplayStatus(collection),
      };
    }

    return {
      collection_id: collection.collection_id,
      name_collection: collection.name_collection,
      slug_collection: collection.slug_collection,
      description_collection: collection.description_collection,
      image_collection: collection.image_collection,
      position_collection: collection.position_collection,
      start_at: collection.start_at,
      end_at: collection.end_at,
    };
  },

  async getProductsByCollection(collectionId, query = {}, isAdmin = false) {
    const collection = await collections.findById(collectionId);
    if (!collection) throw notFound("COLLECTION_NOT_FOUND", "Không tìm thấy bộ sưu tập");
    if (!isAdmin && !isCollectionVisible(collection)) {
      throw notFound("COLLECTION_NOT_FOUND", "Không tìm thấy bộ sưu tập");
    }

    return productListing({
      ...query,
      collection_id: collectionId,
    });
  },

  async createCollection(data, userId) {
    const slug = data.slug_collection ? slugify(data.slug_collection) : slugify(data.name_collection);
    const existingSlug = await collections.findBySlug(slug);
    if (existingSlug) {
      throw conflict("COLLECTION_SLUG_EXISTS", "Slug bộ sưu tập đã tồn tại");
    }

    if (data.start_at && data.end_at && new Date(data.start_at) > new Date(data.end_at)) {
      throw badRequest("INVALID_DATE_RANGE", "start_at phải nhỏ hơn hoặc bằng end_at");
    }

    return transaction(async (client) => {
      const created = await collections.create({
        ...data,
        slug_collection: slug,
      }, client);

      if (audits?.record) {
        await audits.record({
          userId,
          action: "create_collection",
          entityName: "collection",
          entityId: created.collection_id,
          newData: created,
        }, client);
      }

      return created;
    });
  },

  async updateCollection(collectionId, data, userId) {
    const existing = await collections.findById(collectionId);
    if (!existing) throw notFound("COLLECTION_NOT_FOUND", "Không tìm thấy bộ sưu tập");

    let slug = undefined;
    if (data.slug_collection) {
      slug = slugify(data.slug_collection);
      const existingSlug = await collections.findBySlug(slug);
      if (existingSlug && Number(existingSlug.collection_id) !== Number(collectionId)) {
        throw conflict("COLLECTION_SLUG_EXISTS", "Slug bộ sưu tập đã tồn tại");
      }
    }

    const startAt = data.start_at !== undefined ? data.start_at : existing.start_at;
    const endAt = data.end_at !== undefined ? data.end_at : existing.end_at;
    if (startAt && endAt && new Date(startAt) > new Date(endAt)) {
      throw badRequest("INVALID_DATE_RANGE", "start_at phải nhỏ hơn hoặc bằng end_at");
    }

    return transaction(async (client) => {
      const payload = {
        ...data,
        ...(slug ? { slug_collection: slug } : {}),
      };
      const updated = await collections.update(collectionId, payload, client);

      if (audits?.record) {
        await audits.record({
          userId,
          action: "update_collection",
          entityName: "collection",
          entityId: collectionId,
          oldData: existing,
          newData: updated,
        }, client);
      }

      return updated;
    });
  },

  async deleteCollection(collectionId, userId) {
    const existing = await collections.findById(collectionId);
    if (!existing) throw notFound("COLLECTION_NOT_FOUND", "Không tìm thấy bộ sưu tập");

    return transaction(async (client) => {
      await collections.updateStatus(collectionId, false, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "disable_collection",
          entityName: "collection",
          entityId: collectionId,
          oldData: existing,
          newData: { is_active: false },
        }, client);
      }
    });
  },

  async updateCollectionStatus(collectionId, isActive, userId) {
    const existing = await collections.findById(collectionId);
    if (!existing) throw notFound("COLLECTION_NOT_FOUND", "Không tìm thấy bộ sưu tập");

    return transaction(async (client) => {
      const updated = await collections.updateStatus(collectionId, isActive, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: isActive ? "enable_collection" : "disable_collection",
          entityName: "collection",
          entityId: collectionId,
          oldData: existing,
          newData: updated,
        }, client);
      }
      return updated;
    });
  },

  async addProductToCollection(collectionId, payload, userId) {
    const collection = await collections.findById(collectionId);
    if (!collection) throw notFound("COLLECTION_NOT_FOUND", "Không tìm thấy bộ sưu tập");

    if (payload.products && Array.isArray(payload.products)) {
      for (const item of payload.products) {
        const prod = await products.findById(item.product_id);
        if (!prod) throw notFound("PRODUCT_NOT_FOUND", `Không tìm thấy sản phẩm ${item.product_id}`);
      }

      return transaction(async (client) => {
        let currentMax = await collections.getMaxPosition(collectionId, client);
        for (const item of payload.products) {
          const pos = item.position_product_collection !== undefined && item.position_product_collection !== 0
            ? item.position_product_collection
            : ++currentMax;
          await collections.addProduct(collectionId, item.product_id, pos, client);
        }

        if (audits?.record) {
          await audits.record({
            userId,
            action: "add_product_to_collection",
            entityName: "product_collection",
            entityId: `${collectionId}`,
            newData: payload,
          }, client);
        }

        return collections.findCollectionProducts(collectionId, client);
      });
    }

    // Single addition
    const prod = await products.findById(payload.product_id);
    if (!prod) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");

    const existingRel = await collections.findProductCollectionRelation(collectionId, payload.product_id);
    if (existingRel) {
      throw conflict("PRODUCT_COLLECTION_EXISTS", "Sản phẩm đã thuộc bộ sưu tập này");
    }

    return transaction(async (client) => {
      let pos = payload.position_product_collection;
      if (pos === undefined || pos === 0) {
        const maxPos = await collections.getMaxPosition(collectionId, client);
        pos = maxPos + 1;
      }

      const added = await collections.addProduct(collectionId, payload.product_id, pos, client);

      if (audits?.record) {
        await audits.record({
          userId,
          action: "add_product_to_collection",
          entityName: "product_collection",
          entityId: `${collectionId}_${payload.product_id}`,
          newData: added,
        }, client);
      }

      return collections.findCollectionProducts(collectionId, client);
    });
  },

  async removeProductFromCollection(collectionId, productId, userId) {
    const collection = await collections.findById(collectionId);
    if (!collection) throw notFound("COLLECTION_NOT_FOUND", "Không tìm thấy bộ sưu tập");

    const prod = await products.findById(productId);
    if (!prod) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");

    const existingRel = await collections.findProductCollectionRelation(collectionId, productId);
    if (!existingRel) {
      throw notFound("PRODUCT_COLLECTION_NOT_FOUND", "Sản phẩm không thuộc bộ sưu tập này");
    }

    return transaction(async (client) => {
      await collections.removeProduct(collectionId, productId, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "remove_product_from_collection",
          entityName: "product_collection",
          entityId: `${collectionId}_${productId}`,
        }, client);
      }
    });
  },

  async reorderCollectionProducts(collectionId, payload, userId) {
    const collection = await collections.findById(collectionId);
    if (!collection) throw notFound("COLLECTION_NOT_FOUND", "Không tìm thấy bộ sưu tập");

    for (const item of payload.products) {
      const relation = await collections.findProductCollectionRelation(collectionId, item.product_id);
      if (!relation) {
        throw notFound("PRODUCT_COLLECTION_NOT_FOUND", `Sản phẩm ${item.product_id} không thuộc bộ sưu tập này`);
      }
    }

    return transaction(async (client) => {
      await collections.updateProductPositions(collectionId, payload.products, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "reorder_collection_products",
          entityName: "product_collection",
          entityId: `${collectionId}`,
          newData: payload,
        }, client);
      }
      return collections.findCollectionProducts(collectionId, client);
    });
  },
});

const defaultCollectionService = createCollectionService();

export const {
  getCollections,
  getAdminCollections,
  getCollectionById,
  getProductsByCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  updateCollectionStatus,
  addProductToCollection,
  removeProductFromCollection,
  reorderCollectionProducts,
} = defaultCollectionService;
