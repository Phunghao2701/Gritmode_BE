import { badRequest, conflict, notFound } from "../errors/app-error.js";
import { categoryRepository } from "../repositories/category.repository.js";
import { productRepository } from "../repositories/product.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";
import { slugify } from "../utils/validation.js";
import { getProducts } from "./product.service.js";

export const buildCategoryTree = (categories = []) => {
  const map = new Map();
  const roots = [];

  for (const cat of categories) {
    map.set(Number(cat.category_id), {
      ...cat,
      children: [],
    });
  }

  for (const cat of categories) {
    const node = map.get(Number(cat.category_id));
    const parentId = cat.parent_category_id ? Number(cat.parent_category_id) : null;
    if (parentId && map.has(parentId)) {
      map.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => {
      const posA = a.position_category || 0;
      const posB = b.position_category || 0;
      if (posA !== posB) return posA - posB;
      return (a.name_category || "").localeCompare(b.name_category || "");
    });
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(roots);
  return roots;
};

export const hasCategoryCycle = (targetCategoryId, newParentCategoryId, allCategories = []) => {
  if (!targetCategoryId || !newParentCategoryId) return false;
  const targetId = Number(targetCategoryId);
  let currentParentId = Number(newParentCategoryId);

  if (targetId === currentParentId) return true;

  const parentMap = new Map();
  for (const cat of allCategories) {
    const pId = cat.parent_category_id ? Number(cat.parent_category_id) : null;
    parentMap.set(Number(cat.category_id), pId);
  }

  const visited = new Set();
  while (currentParentId) {
    if (currentParentId === targetId) return true;
    if (visited.has(currentParentId)) break;
    visited.add(currentParentId);
    currentParentId = parentMap.get(currentParentId) || null;
  }

  return false;
};

export const createCategoryService = ({
  categories = categoryRepository,
  products = productRepository,
  audits = auditRepository,
  transaction = withTransaction,
  productListing = getProducts,
} = {}) => ({
  async getCategories() {
    const activeCategories = await categories.listActive();
    return buildCategoryTree(activeCategories);
  },

  async getAdminCategories(filter = {}) {
    const allCategories = await categories.listAll(filter);
    if (filter.tree) {
      return buildCategoryTree(allCategories);
    }
    return allCategories;
  },

  async getCategoryById(categoryId, isAdmin = false) {
    const category = await categories.findById(categoryId);
    if (!category) throw notFound("CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");
    if (!isAdmin && category.is_active === false) {
      throw notFound("CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");
    }
    return category;
  },

  async getProductsByCategory(categoryId, query = {}) {
    const category = await categories.findById(categoryId);
    if (!category || category.is_active === false) {
      throw notFound("CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");
    }

    return productListing({
      ...query,
      category_id: categoryId,
    });
  },

  async createCategory(data, userId) {
    const slug = data.slug_category ? slugify(data.slug_category) : slugify(data.name_category);
    const existingSlug = await categories.findBySlug(slug);
    if (existingSlug) {
      throw conflict("CATEGORY_SLUG_EXISTS", "Slug danh mục đã tồn tại");
    }

    if (data.parent_category_id) {
      const parent = await categories.findById(data.parent_category_id);
      if (!parent) {
        throw notFound("PARENT_CATEGORY_NOT_FOUND", "Danh mục cha không tồn tại");
      }
    }

    return transaction(async (client) => {
      const created = await categories.create({
        ...data,
        slug_category: slug,
      }, client);

      if (audits?.record) {
        await audits.record({
          userId,
          action: "create_category",
          entityName: "category",
          entityId: created.category_id,
          newData: created,
        }, client);
      }

      return created;
    });
  },

  async updateCategory(categoryId, data, userId) {
    const existing = await categories.findById(categoryId);
    if (!existing) throw notFound("CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");

    let slug = undefined;
    if (data.slug_category) {
      slug = slugify(data.slug_category);
      const existingSlug = await categories.findBySlug(slug);
      if (existingSlug && Number(existingSlug.category_id) !== Number(categoryId)) {
        throw conflict("CATEGORY_SLUG_EXISTS", "Slug danh mục đã tồn tại");
      }
    }

    if (data.parent_category_id !== undefined) {
      if (data.parent_category_id !== null) {
        const parentId = Number(data.parent_category_id);
        if (parentId === Number(categoryId)) {
          throw badRequest("SELF_PARENT_CATEGORY", "Danh mục không thể tự làm cha của chính nó");
        }
        const parent = await categories.findById(parentId);
        if (!parent) {
          throw notFound("PARENT_CATEGORY_NOT_FOUND", "Danh mục cha không tồn tại");
        }
        const allCategories = await categories.listAll();
        if (hasCategoryCycle(categoryId, parentId, allCategories)) {
          throw badRequest("INVALID_CATEGORY_HIERARCHY", "Không thể tạo vòng lặp trong cây danh mục");
        }
      }
    }

    return transaction(async (client) => {
      const payload = {
        ...data,
        ...(slug ? { slug_category: slug } : {}),
      };
      const updated = await categories.update(categoryId, payload, client);

      if (audits?.record) {
        await audits.record({
          userId,
          action: "update_category",
          entityName: "category",
          entityId: categoryId,
          oldData: existing,
          newData: updated,
        }, client);
      }

      return updated;
    });
  },

  async deleteCategory(categoryId, userId) {
    const existing = await categories.findById(categoryId);
    if (!existing) throw notFound("CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");

    return transaction(async (client) => {
      await categories.updateStatus(categoryId, false, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "disable_category",
          entityName: "category",
          entityId: categoryId,
          oldData: existing,
          newData: { is_active: false },
        }, client);
      }
    });
  },

  async updateCategoryStatus(categoryId, isActive, userId) {
    const existing = await categories.findById(categoryId);
    if (!existing) throw notFound("CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");

    return transaction(async (client) => {
      const updated = await categories.updateStatus(categoryId, isActive, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: isActive ? "enable_category" : "disable_category",
          entityName: "category",
          entityId: categoryId,
          oldData: existing,
          newData: updated,
        }, client);
      }
      return updated;
    });
  },

  async assignProductCategory(productId, payload, userId) {
    const product = await products.findById(productId);
    if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");

    if (payload.categories && Array.isArray(payload.categories)) {
      for (const item of payload.categories) {
        const cat = await categories.findById(item.category_id);
        if (!cat) throw notFound("CATEGORY_NOT_FOUND", `Không tìm thấy danh mục ${item.category_id}`);
      }

      return transaction(async (client) => {
        for (const item of payload.categories) {
          await categories.assignProduct(productId, item.category_id, Boolean(item.is_primary), client);
          if (item.is_primary) {
            await categories.setPrimaryCategory(productId, item.category_id, client);
          }
        }

        if (audits?.record) {
          await audits.record({
            userId,
            action: "assign_product_category",
            entityName: "product_category",
            entityId: `${productId}`,
            newData: payload,
          }, client);
        }

        return categories.findProductCategories(productId, client);
      });
    }

    // Single category assignment
    const cat = await categories.findById(payload.category_id);
    if (!cat) throw notFound("CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");

    const existingRel = await categories.findProductCategoryRelation(productId, payload.category_id);
    if (existingRel) {
      throw conflict("PRODUCT_CATEGORY_EXISTS", "Sản phẩm đã thuộc danh mục này");
    }

    return transaction(async (client) => {
      const assigned = await categories.assignProduct(productId, payload.category_id, Boolean(payload.is_primary), client);
      if (payload.is_primary) {
        await categories.setPrimaryCategory(productId, payload.category_id, client);
      }

      if (audits?.record) {
        await audits.record({
          userId,
          action: "assign_product_category",
          entityName: "product_category",
          entityId: `${productId}_${payload.category_id}`,
          newData: assigned,
        }, client);
      }

      return categories.findProductCategories(productId, client);
    });
  },

  async removeProductCategory(productId, categoryId, userId) {
    const product = await products.findById(productId);
    if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");

    const category = await categories.findById(categoryId);
    if (!category) throw notFound("CATEGORY_NOT_FOUND", "Không tìm thấy danh mục");

    const existingRel = await categories.findProductCategoryRelation(productId, categoryId);
    if (!existingRel) {
      throw notFound("PRODUCT_CATEGORY_NOT_FOUND", "Sản phẩm không thuộc danh mục này");
    }

    return transaction(async (client) => {
      await categories.removeProduct(productId, categoryId, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "remove_product_category",
          entityName: "product_category",
          entityId: `${productId}_${categoryId}`,
        }, client);
      }
    });
  },

  async setPrimaryCategory(productId, categoryId, userId) {
    const product = await products.findById(productId);
    if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");

    const existingRel = await categories.findProductCategoryRelation(productId, categoryId);
    if (!existingRel) {
      throw notFound("PRODUCT_CATEGORY_NOT_FOUND", "Sản phẩm không thuộc danh mục này");
    }

    return transaction(async (client) => {
      await categories.setPrimaryCategory(productId, categoryId, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "set_primary_category",
          entityName: "product_category",
          entityId: `${productId}_${categoryId}`,
          newData: { is_primary: true },
        }, client);
      }
      return categories.findProductCategories(productId, client);
    });
  },
});

const defaultCategoryService = createCategoryService();

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
} = defaultCategoryService;
