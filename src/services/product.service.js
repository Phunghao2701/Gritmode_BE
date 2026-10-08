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

const normalizeOptionValueInput = (rawValue) => {
  if (typeof rawValue === "string") return { value_option: rawValue, is_hidden: false };
  return {
    value_option: rawValue?.value_option || "",
    is_hidden: Boolean(rawValue?.is_hidden),
  };
};

const findExistingByIds = async (repository, ids = [], client) => {
  const normalizedIds = [...new Set(ids.map((id) => Number(id)).filter(Number.isInteger))];
  if (!normalizedIds.length) return [];

  if (typeof repository.findByIds === "function") {
    return repository.findByIds(normalizedIds, client);
  }

  const found = [];
  for (const id of normalizedIds) {
    const record = await repository.findById(id, client);
    if (record) found.push(record);
  }
  return found;
};

const findExistingBySkus = async (repository, skus = [], client) => {
  const normalizedSkus = [...new Set(
    skus.map((sku) => String(sku || '').trim()).filter(Boolean),
  )];
  if (!normalizedSkus.length) return [];

  if (typeof repository.findBySkus === "function") {
    return repository.findBySkus(normalizedSkus, client);
  }

  const found = [];
  for (const sku of normalizedSkus) {
    const record = await repository.findBySku(sku, client);
    if (record) found.push({ ...record, sku: record.sku || sku });
  }
  return found;
};

const normalizeName = (value) => String(value ?? "").trim().toLowerCase();
const normalizeSku = (value) => String(value ?? "").trim().toUpperCase();

const normalizeNullableNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
};

const normalizeDate = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? String(value) : timestamp;
};

const sameNumberSet = (left = [], right = []) => {
  const normalize = (values) => [...new Set(values.map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

const sameOrderedNumbers = (left = [], right = []) => {
  const normalizedLeft = left.map(Number);
  const normalizedRight = right.map(Number);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

const optionValueKey = (optionName, value) => `${normalizeName(optionName)}\u0000${normalizeName(value)}`;

const getVariantOptionValueIds = (variant) => (variant?.option_values || [])
  .map((optionValue) => Number(optionValue.product_option_value_id))
  .filter(Number.isInteger);

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
    return products.findDetail(product.product_id, null, product);
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
      const existingCategories = await findExistingByIds(categories, input.category_ids, client);
      const categoryIds = new Set(existingCategories.map((category) => Number(category.category_id)));
      for (const categoryId of input.category_ids) {
        if (!categoryIds.has(Number(categoryId))) {
          throw notFound("CATEGORY_NOT_FOUND", `Không tìm thấy danh mục ${categoryId}`);
        }
      }

      const existingCollections = await findExistingByIds(collections, input.collection_ids || [], client);
      const collectionIds = new Set(existingCollections.map((collection) => Number(collection.collection_id)));
      for (const collectionId of input.collection_ids || []) {
        if (!collectionIds.has(Number(collectionId))) {
          throw notFound("COLLECTION_NOT_FOUND", `Không tìm thấy bộ sưu tập ${collectionId}`);
        }
      }

      const existingVariants = await findExistingBySkus(
        variants,
        input.variants.map((variant) => variant.sku),
        client,
      );
      const existingSkus = new Set(existingVariants.map((variant) => String(variant.sku).trim().toLowerCase()));
      for (const variant of input.variants) {
        if (existingSkus.has(String(variant.sku).trim().toLowerCase())) {
          throw conflict("SKU_ALREADY_EXISTS", `SKU ${variant.sku} đã tồn tại`);
        }
      }

      const product = await products.create(input, client);
      const valueIdByReference = new Map();
      
      const createdOptions = [];
      for (const optionInput of input.options) {
        const createdOption = await options.create(product.product_id, optionInput, client);
        const createdValues = [];
        for (const rawValue of optionInput.values) {
          createdValues.push(await options.createValue(
            createdOption.product_option_id,
            normalizeOptionValueInput(rawValue),
            client,
          ));
        }
        createdValues.forEach((createdValue, idx) => {
          const valueName = normalizeOptionValueInput(optionInput.values[idx]).value_option;
          valueIdByReference.set(`${optionInput.name_option.toLowerCase()}\u0000${valueName.toLowerCase()}`, Number(createdValue.product_option_value_id));
        });
        createdOptions.push({ ...createdOption, values: createdValues });
      }

      const createdVariants = [];
      for (const variantInput of input.variants) {
        const optionValueIds = input.options.map((option) =>
          valueIdByReference.get(`${option.name_option.toLowerCase()}\u0000${variantInput.option_values[option.name_option].toLowerCase()}`)
        );
        const createdVariant = await variants.create(product.product_id, variantInput, client);
        await variants.createOptionValuesMap(createdVariant.product_variant_id, optionValueIds, client);
        await variants.initializeInventory(createdVariant.product_variant_id, client);
        const inventory = await inventories.updateStock(createdVariant.product_variant_id, variantInput.quantity_stock, client);
        createdVariants.push({ ...createdVariant, option_value_ids: optionValueIds, inventory });
      }

      const createdImages = [];
      for (const imageInput of input.images) {
        const optionValueId = imageInput.option_value
          ? valueIdByReference.get(`${imageInput.option_value.option_name.toLowerCase()}\u0000${imageInput.option_value.value.toLowerCase()}`)
          : null;
        createdImages.push(await images.create(
          product.product_id,
          { ...imageInput, product_option_value_id: optionValueId },
          client,
        ));
      }

      const createdCategories = [];
      for (const categoryId of input.category_ids) {
        createdCategories.push(await categories.assignProduct(
          product.product_id,
          categoryId,
          categoryId === input.primary_category_id,
          client,
        ));
      }

      const createdCollections = [];
      for (const [position, collectionId] of (input.collection_ids || []).entries()) {
        createdCollections.push(await collections.addProduct(collectionId, product.product_id, position, client));
      }

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

      const existingCategories = await findExistingByIds(categories, input.category_ids, client);
      const categoryIds = new Set(existingCategories.map((category) => Number(category.category_id)));
      for (const categoryId of input.category_ids) {
        if (!categoryIds.has(Number(categoryId))) {
          throw notFound("CATEGORY_NOT_FOUND", `Không tìm thấy danh mục ${categoryId}`);
        }
      }

      const existingCollections = await findExistingByIds(collections, input.collection_ids || [], client);
      const collectionIds = new Set(existingCollections.map((collection) => Number(collection.collection_id)));
      for (const collectionId of input.collection_ids || []) {
        if (!collectionIds.has(Number(collectionId))) {
          throw notFound("COLLECTION_NOT_FOUND", `Không tìm thấy bộ sưu tập ${collectionId}`);
        }
      }

      const existingVariantsInProduct = existing.variants || [];
      const categoryInputs = input.category_ids || [];
      const collectionInputs = input.collection_ids || [];
      const optionInputs = input.options || [];
      const variantInputs = input.variants || [];
      const imageInputs = input.images || [];
      const existingVariantIds = new Set(existingVariantsInProduct.map((variant) => Number(variant.product_variant_id)));
      const existingVariantById = new Map(
        existingVariantsInProduct.map((variant) => [Number(variant.product_variant_id), variant]),
      );
      const retainedVariantIds = new Set();
      const existingVariants = await findExistingBySkus(
        variants,
        variantInputs.map((variant) => variant.sku),
        client,
      );
      const existingVariantBySku = new Map(
        existingVariants.map((variant) => [String(variant.sku).trim().toLowerCase(), variant]),
      );

      for (const variantInput of variantInputs) {
        if (variantInput.product_variant_id && !existingVariantIds.has(Number(variantInput.product_variant_id))) {
          throw conflict("VARIANT_NOT_IN_PRODUCT", `Biến thể ${variantInput.product_variant_id} không thuộc sản phẩm này`);
        }
        const skuOwner = existingVariantBySku.get(String(variantInput.sku).trim().toLowerCase());
        if (skuOwner && Number(skuOwner.product_variant_id) !== Number(variantInput.product_variant_id || 0)) {
          throw conflict("SKU_ALREADY_EXISTS", `SKU ${variantInput.sku} đã tồn tại`);
        }
      }

      const productPatch = {};
      if (input.name_product !== undefined && String(input.name_product ?? "") !== String(existing.name_product ?? "")) {
        productPatch.name_product = input.name_product;
      }
      if (input.description !== undefined && String(input.description ?? "") !== String(existing.description ?? "")) {
        productPatch.description = input.description;
      }
      if (input.status_product !== undefined && input.status_product !== existing.status_product) {
        productPatch.status_product = input.status_product;
      }
      if (Object.keys(productPatch).length > 0) {
        await products.update(productId, productPatch, client);
      }

      const valueIdByReference = new Map();
      const existingOptions = existing.options || [];
      const existingOptionByName = new Map(existingOptions.map((option) => [normalizeName(option.name_option), option]));
      const seenOptionNames = new Set();
      let optionsChanged = false;

      for (const optionInput of optionInputs) {
        const optionName = normalizeName(optionInput.name_option);
        seenOptionNames.add(optionName);
        let option = existingOptionByName.get(optionName) || null;
        if (!option && typeof options.findByNameAndProduct === "function") {
          option = await options.findByNameAndProduct(productId, optionInput.name_option, client);
        }
        if (!option) {
          option = await options.create(productId, optionInput, client);
          optionsChanged = true;
        }

        const existingValues = option.values || [];
        const existingValueByName = new Map(existingValues.map((value) => [normalizeName(value.value_option), value]));
        const seenValueNames = new Set();
        for (const rawValue of optionInput.values) {
          const valueInput = normalizeOptionValueInput(rawValue);
          const valueName = normalizeName(valueInput.value_option);
          seenValueNames.add(valueName);
          let optionValue = existingValueByName.get(valueName) || null;
          if (!optionValue && typeof options.findValueByNameAndOption === "function") {
            optionValue = await options.findValueByNameAndOption(option.product_option_id, valueInput.value_option, client);
          }
          if (!optionValue) {
            optionValue = await options.createValue(option.product_option_id, valueInput, client);
            optionsChanged = true;
          } else if (
            String(optionValue.value_option ?? "") !== String(valueInput.value_option ?? "")
            || Boolean(optionValue.is_hidden) !== Boolean(valueInput.is_hidden)
          ) {
            optionValue = await options.updateValue(optionValue.product_option_value_id, valueInput, client);
            optionsChanged = true;
          }
          valueIdByReference.set(
            optionValueKey(optionInput.name_option, valueInput.value_option),
            Number(optionValue.product_option_value_id),
          );
        }
        if (existingValues.length !== seenValueNames.size || existingValues.some((value) => !seenValueNames.has(normalizeName(value.value_option)))) {
          optionsChanged = true;
        }
      }
      if (existingOptions.length !== seenOptionNames.size || existingOptions.some((option) => !seenOptionNames.has(normalizeName(option.name_option)))) {
        optionsChanged = true;
      }

      for (const variantInput of variantInputs) {
        const optionValueIds = optionInputs.map((option) =>
          valueIdByReference.get(optionValueKey(option.name_option, variantInput.option_values?.[option.name_option])),
        );
        const variantId = variantInput.product_variant_id ? Number(variantInput.product_variant_id) : null;
        if (variantId) {
          const existingVariant = existingVariantById.get(variantId);
          const variantPatch = {};
          if (normalizeSku(existingVariant.sku) !== normalizeSku(variantInput.sku)) variantPatch.sku = variantInput.sku;
          if (normalizeNullableNumber(existingVariant.price) !== normalizeNullableNumber(variantInput.price)) variantPatch.price = variantInput.price;
          if (normalizeNullableNumber(existingVariant.sale_price) !== normalizeNullableNumber(variantInput.sale_price)) variantPatch.sale_price = variantInput.sale_price;
          if (normalizeDate(existingVariant.sale_start_at) !== normalizeDate(variantInput.sale_start_at)) variantPatch.sale_start_at = variantInput.sale_start_at;
          if (normalizeDate(existingVariant.sale_end_at) !== normalizeDate(variantInput.sale_end_at)) variantPatch.sale_end_at = variantInput.sale_end_at;
          if (Object.keys(variantPatch).length > 0) {
            await variants.update(variantId, variantPatch, client);
          }

          if (!sameNumberSet(getVariantOptionValueIds(existingVariant), optionValueIds)) {
            await variants.replaceOptionValuesMap(variantId, optionValueIds, client);
            optionsChanged = true;
          }

          const existingStock = existingVariant.inventory?.quantity_stock ?? existingVariant.quantity_stock;
          if (normalizeNullableNumber(existingStock) !== normalizeNullableNumber(variantInput.quantity_stock)) {
            await inventories.updateStock(variantId, variantInput.quantity_stock, client);
          }
          retainedVariantIds.add(variantId);
        } else {
          const variant = await variants.create(productId, variantInput, client);
          await variants.initializeInventory(variant.product_variant_id, client);
          retainedVariantIds.add(Number(variant.product_variant_id));
          await variants.createOptionValuesMap(variant.product_variant_id, optionValueIds, client);
          await inventories.updateStock(variant.product_variant_id, variantInput.quantity_stock, client);
          optionsChanged = true;
        }
      }

      let removedVariantCount = 0;
      for (const variantId of existingVariantIds) {
        if (retainedVariantIds.has(variantId)) continue;
        if (await variants.hasReferences(variantId, client)) {
          throw conflict("VARIANT_HAS_REFERENCES", `Không thể xóa biến thể ${variantId} vì đang được dùng trong giỏ hàng hoặc đơn hàng`);
        }
        await variants.delete(variantId, client);
        removedVariantCount += 1;
      }

      const existingImages = existing.images || [];
      const existingImageById = new Map(existingImages.map((image) => [Number(image.product_image_id), image]));
      const retainedImageIds = new Set();
      let imagesChanged = false;
      for (const [index, imageInput] of imageInputs.entries()) {
        const imageId = imageInput.product_image_id ? Number(imageInput.product_image_id) : null;
        const optionValueId = imageInput.option_value
          ? valueIdByReference.get(optionValueKey(imageInput.option_value.option_name, imageInput.option_value.value))
          : null;
        const position = imageInput.position_product_image ?? index;

        if (imageId) {
          const existingImage = existingImageById.get(imageId);
          if (!existingImage) {
            throw conflict("IMAGE_NOT_IN_PRODUCT", `áº¢nh ${imageId} khÃ´ng thuá»™c sáº£n pháº©m nÃ y`);
          }
          retainedImageIds.add(imageId);
          const imagePatch = {};
          if (existingImage.url_product_image !== imageInput.url_product_image) imagePatch.url_product_image = imageInput.url_product_image;
          const currentOptionValueId = existingImage.product_option_value_id ?? null;
          if (Number(currentOptionValueId || 0) !== Number(optionValueId ?? currentOptionValueId ?? 0)) {
            imagePatch.product_option_value_id = optionValueId;
          }
          if (Number(existingImage.position_product_image) !== Number(position)) imagePatch.position_product_image = position;
          if (Object.keys(imagePatch).length > 0) {
            await images.update(imageId, imagePatch, client);
            imagesChanged = true;
          }
        } else {
          await images.create(productId, { ...imageInput, product_option_value_id: optionValueId, position_product_image: position }, client);
          imagesChanged = true;
        }
      }

      for (const existingImage of existingImages) {
        const imageId = Number(existingImage.product_image_id);
        if (retainedImageIds.has(imageId)) continue;
        await images.delete(imageId, client);
        imagesChanged = true;
      }

      const desiredCategoryIds = [...new Set(categoryInputs.map(Number))];
      const existingCategoryIds = (existing.categories || []).map((category) => Number(category.category_id));
      const existingPrimaryCategoryId = (existing.categories || []).find((category) => category.is_primary)?.category_id;
      const categoriesChanged = !sameNumberSet(existingCategoryIds, desiredCategoryIds)
        || Number(existingPrimaryCategoryId || 0) !== Number(input.primary_category_id || 0);
      if (categoriesChanged) {
        if (typeof products.syncCategories === "function") {
          await products.syncCategories(productId, desiredCategoryIds, Number(input.primary_category_id), client);
        } else {
          await products.replaceCategories(productId, desiredCategoryIds, Number(input.primary_category_id), client);
        }
      }

      const desiredCollectionIds = [...new Set(collectionInputs.map(Number))];
      const existingCollectionIds = (existing.collections || []).map((collection) => Number(collection.collection_id));
      const collectionsChanged = !sameOrderedNumbers(existingCollectionIds, desiredCollectionIds);
      if (collectionsChanged) {
        if (typeof products.syncCollections === "function") {
          await products.syncCollections(productId, desiredCollectionIds, client);
        } else {
          await products.replaceCollections(productId, desiredCollectionIds, client);
        }
      }

      if (optionsChanged || removedVariantCount > 0 || imagesChanged) {
        await products.deleteUnusedOptions(productId, client);
      }

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
