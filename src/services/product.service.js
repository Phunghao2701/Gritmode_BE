import { conflict, notFound } from "../errors/app-error.js";
import { productRepository } from "../repositories/product.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";
import { productOptionRepository } from "../repositories/product-option.repository.js";
import { productVariantRepository } from "../repositories/product-variant.repository.js";
import { productImageRepository } from "../repositories/product-image.repository.js";
import { categoryRepository } from "../repositories/category.repository.js";
import { collectionRepository } from "../repositories/collection.repository.js";
import { inventoryRepository } from "../repositories/inventory.repository.js";
import { PRODUCT_STATUS } from "../constants/product.js";

export const createProductService = ({
  products = productRepository,
  audit = auditRepository,
  transaction = withTransaction,
  options = productOptionRepository,
  variants = productVariantRepository,
  images = productImageRepository,
  categories = categoryRepository,
  collections = collectionRepository,
  inventories = inventoryRepository,
} = {}) => ({
  async getProducts(query = {}) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const pagination = { page, limit };
    let categoryId = query.category_id;
    if (!categoryId && query.category_slug) {
      const category = await categories.findBySlug(query.category_slug);
      categoryId = category?.category_id || -1;
    }
    let collectionId = query.collection_id;
    if (!collectionId && query.collection_slug) {
      const collection = await collections.findBySlug(query.collection_slug);
      collectionId = collection?.collection_id || -1;
    }
    const filters = {
      search: query.search,
      category_id: categoryId,
      collection_id: collectionId,
      min_price: query.min_price,
      max_price: query.max_price,
      status_product: PRODUCT_STATUS.ACTIVE,
    };
    const sort = query.sort || "newest";

    const [total, items] = await Promise.all([
      products.countProducts(filters),
      products.findProducts(filters, pagination, sort),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async getAdminProducts(query = {}) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const filters = {
      search: query.search,
      status_product: query.status_product,
      exclude_status_product: PRODUCT_STATUS.ARCHIVED,
    };
    const [total, items] = await Promise.all([
      products.countProducts(filters),
      products.findProducts(filters, { page, limit }, query.sort || "newest"),
    ]);
    return { items, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 1 } };
  },

  async getProductById(productId) {
    const product = await products.findDetail(productId);
    if (!product || product.status_product !== PRODUCT_STATUS.ACTIVE) {
      throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
    }
    return product;
  },

  async getProductBySlug(slug) {
    const product = await products.findBySlug(slug);
    if (!product || product.status_product !== PRODUCT_STATUS.ACTIVE) {
      throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
    }
    return this.getProductById(product.product_id);
  },

  async getAdminProductById(productId) {
    const product = await products.findDetail(productId);
    if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
    return product;
  },

  async publishProduct(productId, adminUserId) {
    return transaction(async (client) => {
      const product = await products.findById(productId, client);
      if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
      if (product.status_product !== PRODUCT_STATUS.DRAFT) {
        throw conflict("INVALID_PRODUCT_STATUS", "Chỉ Product Draft mới có thể publish");
      }
      const readiness = await products.getPublishReadiness(productId, client);
      const missing = [];
      if (Number(readiness.variant_count) < 1) missing.push("variants");
      if (Number(readiness.invalid_variant_count) > 0) missing.push("valid_variant_inventory");
      if (Number(readiness.category_count) < 1) missing.push("categories");
      if (Number(readiness.primary_category_count) !== 1) missing.push("primary_category");
      if (Number(readiness.image_count) < 1) missing.push("images");
      if (Number(readiness.incomplete_variant_count) > 0) missing.push("variant_options");
      if (missing.length) throw conflict("PRODUCT_NOT_READY", "Product is not ready to publish", { missing });
      const updated = await products.updateStatus(productId, PRODUCT_STATUS.ACTIVE, client);
      await audit.log({ userId: adminUserId, action: "publish_product", entityName: "product", entityId: productId, oldData: product, newData: updated }, client);
      return updated;
    });
  },

  async archiveProduct(productId, adminUserId) {
    return transaction(async (client) => {
      const product = await products.findById(productId, client);
      if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
      if (product.status_product !== PRODUCT_STATUS.ACTIVE) {
        throw conflict("INVALID_PRODUCT_STATUS", "Chỉ Product Active mới có thể archive");
      }
      const updated = await products.updateStatus(productId, PRODUCT_STATUS.ARCHIVED, client);
      await audit.log({ userId: adminUserId, action: "archive_product", entityName: "product", entityId: productId, oldData: product, newData: updated }, client);
      return updated;
    });
  },

  async createProduct(input, adminUserId) {
    return transaction(async (client) => {
      const product = await products.create(input, client);
      if (audit?.log) {
        await audit.log(
          {
            userId: adminUserId,
            action: "create_product",
            entityName: "product",
            entityId: product.product_id,
            newData: product,
          },
          client,
        );
      }
      return product;
    });
  },

  async createFullProduct(input, adminUserId) {
    return transaction(async (client) => {
      await Promise.all([
        Promise.all(input.category_ids.map(async (categoryId) => {
          if (!await categories.findById(categoryId, client)) {
            throw notFound("CATEGORY_NOT_FOUND", `Không tìm thấy danh mục ${categoryId}`);
          }
        })),
        Promise.all((input.collection_ids || []).map(async (collectionId) => {
          if (!await collections.findById(collectionId, client)) {
            throw notFound("COLLECTION_NOT_FOUND", `Không tìm thấy bộ sưu tập ${collectionId}`);
          }
        })),
        Promise.all(input.variants.map(async (variant) => {
          if (await variants.findBySku(variant.sku, client)) {
            throw conflict("SKU_ALREADY_EXISTS", `SKU ${variant.sku} đã tồn tại`);
          }
        })),
      ]);

      const product = await products.create(input, client);
      const valueIdByReference = new Map();
      
      const createdOptions = [];
      for (const optionInput of input.options) {
        const createdOption = await options.create(product.product_id, optionInput, client);
        const createdValues = await Promise.all(
          optionInput.values.map((value) =>
            options.createValue(createdOption.product_option_id, { value_option: value }, client)
          )
        );
        createdValues.forEach((createdValue, idx) => {
          valueIdByReference.set(`${optionInput.name_option.toLowerCase()}\u0000${optionInput.values[idx].toLowerCase()}`, Number(createdValue.product_option_value_id));
        });
        createdOptions.push({ ...createdOption, values: createdValues });
      }

      const createdVariants = await Promise.all(
        input.variants.map(async (variantInput) => {
          const optionValueIds = input.options.map((option) =>
            valueIdByReference.get(`${option.name_option.toLowerCase()}\u0000${variantInput.option_values[option.name_option].toLowerCase()}`)
          );
          const createdVariant = await variants.create(product.product_id, variantInput, client);
          await variants.createOptionValuesMap(createdVariant.product_variant_id, optionValueIds, client);
          await variants.initializeInventory(createdVariant.product_variant_id, client);
          const inventory = await inventories.updateStock(createdVariant.product_variant_id, variantInput.quantity_stock, client);
          return { ...createdVariant, option_value_ids: optionValueIds, inventory };
        })
      );

      const [createdImages, createdCategories, createdCollections] = await Promise.all([
        Promise.all(
          input.images.map(async (imageInput) => {
            const optionValueId = imageInput.option_value
              ? valueIdByReference.get(`${imageInput.option_value.option_name.toLowerCase()}\u0000${imageInput.option_value.value.toLowerCase()}`)
              : null;
            return images.create(product.product_id, { ...imageInput, product_option_value_id: optionValueId }, client);
          })
        ),
        Promise.all(
          input.category_ids.map((categoryId) =>
            categories.assignProduct(product.product_id, categoryId, categoryId === input.primary_category_id, client)
          )
        ),
        Promise.all(
          (input.collection_ids || []).map((collectionId, position) =>
            collections.addProduct(collectionId, product.product_id, position, client)
          )
        ),
      ]);

      const result = { ...product, options: createdOptions, variants: createdVariants, images: createdImages, categories: createdCategories, collections: createdCollections };
      if (audit?.log) {
        await audit.log({ userId: adminUserId, action: "create_full_product", entityName: "product", entityId: product.product_id, newData: result }, client);
      }
      return result;
    });
  },

  async updateProduct(productId, input, adminUserId) {
    return transaction(async (client) => {
      const existing = await products.findById(productId, client);
      if (!existing) {
        throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
      }

      const updated = await products.update(productId, input, client);
      if (audit?.log) {
        await audit.log(
          {
            userId: adminUserId,
            action: "update_product",
            entityName: "product",
            entityId: productId,
            oldData: existing,
            newData: updated,
          },
          client,
        );
      }
      return updated;
    });
  },

  async updateFullProduct(productId, input, adminUserId) {
    return transaction(async (client) => {
      const existing = await products.findDetail(productId, client);
      if (!existing) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");

      await Promise.all([
        Promise.all(input.category_ids.map(async (categoryId) => {
          if (!await categories.findById(categoryId, client)) {
            throw notFound("CATEGORY_NOT_FOUND", `Không tìm thấy danh mục ${categoryId}`);
          }
        })),
        Promise.all((input.collection_ids || []).map(async (collectionId) => {
          if (!await collections.findById(collectionId, client)) {
            throw notFound("COLLECTION_NOT_FOUND", `Không tìm thấy bộ sưu tập ${collectionId}`);
          }
        })),
      ]);

      const existingVariantIds = new Set(existing.variants.map((variant) => Number(variant.product_variant_id)));
      const retainedVariantIds = new Set();
      
      await Promise.all(
        input.variants.map(async (variantInput) => {
          if (variantInput.product_variant_id && !existingVariantIds.has(Number(variantInput.product_variant_id))) {
            throw conflict("VARIANT_NOT_IN_PRODUCT", `Biến thể ${variantInput.product_variant_id} không thuộc sản phẩm này`);
          }
          const skuOwner = await variants.findBySku(variantInput.sku, client);
          if (skuOwner && Number(skuOwner.product_variant_id) !== Number(variantInput.product_variant_id || 0)) {
            throw conflict("SKU_ALREADY_EXISTS", `SKU ${variantInput.sku} đã tồn tại`);
          }
        })
      );

      await products.update(productId, input, client);

      const valueIdByReference = new Map();
      for (const optionInput of input.options) {
        let option = await options.findByNameAndProduct(productId, optionInput.name_option, client);
        if (!option) option = await options.create(productId, optionInput, client);
        for (const value of optionInput.values) {
          let optionValue = await options.findValueByNameAndOption(option.product_option_id, value, client);
          if (!optionValue) optionValue = await options.createValue(option.product_option_id, { value_option: value }, client);
          valueIdByReference.set(
            `${optionInput.name_option.toLowerCase()}\u0000${value.toLowerCase()}`,
            Number(optionValue.product_option_value_id),
          );
        }
      }

      await Promise.all(
        input.variants.map(async (variantInput) => {
          const optionValueIds = input.options.map((option) =>
            valueIdByReference.get(`${option.name_option.toLowerCase()}\u0000${variantInput.option_values[option.name_option].toLowerCase()}`),
          );
          let variant;
          if (variantInput.product_variant_id) {
            variant = await variants.update(variantInput.product_variant_id, variantInput, client);
            retainedVariantIds.add(Number(variantInput.product_variant_id));
          } else {
            variant = await variants.create(productId, variantInput, client);
            await variants.initializeInventory(variant.product_variant_id, client);
            retainedVariantIds.add(Number(variant.product_variant_id));
          }
          await variants.replaceOptionValuesMap(variant.product_variant_id, optionValueIds, client);
          await inventories.updateStock(variant.product_variant_id, variantInput.quantity_stock, client);
        })
      );

      for (const variantId of existingVariantIds) {
        if (retainedVariantIds.has(variantId)) continue;
        if (await variants.hasReferences(variantId, client)) {
          throw conflict("VARIANT_HAS_REFERENCES", `Không thể xóa biến thể ${variantId} vì đang được dùng trong giỏ hàng hoặc đơn hàng`);
        }
        await variants.delete(variantId, client);
      }

      await products.deleteImagesByProduct(productId, client);
      
      await Promise.all([
        Promise.all(
          input.images.map(async (imageInput) => {
            const optionValueId = imageInput.option_value
              ? valueIdByReference.get(`${imageInput.option_value.option_name.toLowerCase()}\u0000${imageInput.option_value.value.toLowerCase()}`)
              : null;
            return images.create(productId, { ...imageInput, product_option_value_id: optionValueId }, client);
          })
        ),
        products.replaceCategories(productId, input.category_ids, input.primary_category_id, client),
        products.replaceCollections(productId, input.collection_ids || [], client),
      ]);
      
      await products.deleteUnusedOptions(productId, client);

      const updated = await products.findDetail(productId, client);
      if (audit?.log) {
        await audit.log({ userId: adminUserId, action: "update_full_product", entityName: "product", entityId: productId, oldData: existing, newData: updated }, client);
      }
      return updated;
    });
  },

  async deleteProduct(productId, adminUserId) {
    return transaction(async (client) => {
      const existing = await products.findById(productId, client);
      if (!existing) {
        throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
      }

      if (existing.status_product === PRODUCT_STATUS.ARCHIVED) return existing;
      const deleted = await products.updateStatus(productId, PRODUCT_STATUS.ARCHIVED, client);

      if (audit?.log) {
        await audit.log(
          {
            userId: adminUserId,
            action: "soft_delete_product",
            entityName: "product",
            entityId: productId,
            oldData: existing,
          },
          client,
        );
      }
      return deleted;
    });
  },

  async publishProductLegacy(productId, adminUserId) {
    return transaction(async (client) => {
      const existing = await products.findById(productId, client);
      if (!existing) {
        throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
      }
      const updated = await products.updateStatus(productId, PRODUCT_STATUS.ACTIVE, client);
      if (audit?.log) {
        await audit.log(
          {
            userId: adminUserId,
            action: "publish_product",
            entityName: "product",
            entityId: productId,
            oldData: existing,
            newData: updated,
          },
          client,
        );
      }
      return updated;
    });
  },

  async archiveProductLegacy(productId, adminUserId) {
    return transaction(async (client) => {
      const existing = await products.findById(productId, client);
      if (!existing) {
        throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
      }
      const updated = await products.updateStatus(productId, PRODUCT_STATUS.ARCHIVED, client);
      if (audit?.log) {
        await audit.log(
          {
            userId: adminUserId,
            action: "archive_product",
            entityName: "product",
            entityId: productId,
            oldData: existing,
            newData: updated,
          },
          client,
        );
      }
      return updated;
    });
  },

  async productExists(productId) {
    const existing = await products.findById(productId);
    return Boolean(existing);
  },
});

const defaultProductService = createProductService();

export const getProducts = (query) => defaultProductService.getProducts(query);
export const getAdminProducts = (query) => defaultProductService.getAdminProducts(query);
export const getProductById = (productId) => defaultProductService.getProductById(productId);
export const getProductBySlug = (slug) => defaultProductService.getProductBySlug(slug);
export const getAdminProductById = (productId) => defaultProductService.getAdminProductById(productId);
export const publishProduct = (productId, adminUserId) => defaultProductService.publishProduct(productId, adminUserId);
export const archiveProduct = (productId, adminUserId) => defaultProductService.archiveProduct(productId, adminUserId);
export const createProduct = (input, adminUserId) => defaultProductService.createProduct(input, adminUserId);
export const createFullProduct = (input, adminUserId) => defaultProductService.createFullProduct(input, adminUserId);
export const updateProduct = (productId, input, adminUserId) => defaultProductService.updateProduct(productId, input, adminUserId);
export const updateFullProduct = (productId, input, adminUserId) => defaultProductService.updateFullProduct(productId, input, adminUserId);
export const deleteProduct = (productId, adminUserId) => defaultProductService.deleteProduct(productId, adminUserId);
export const productExists = (productId) => defaultProductService.productExists(productId);
