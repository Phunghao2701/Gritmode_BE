import { badRequest, conflict, notFound } from "../errors/app-error.js";
import { productRepository } from "../repositories/product.repository.js";
import { productOptionRepository } from "../repositories/product-option.repository.js";
import { productVariantRepository } from "../repositories/product-variant.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";

export const createProductVariantService = ({
  products = productRepository,
  options = productOptionRepository,
  variants = productVariantRepository,
  audits = auditRepository,
  transaction = withTransaction,
} = {}) => {
  const validateOptionValuesForProduct = async (productId, optionValueIds, currentVariantId = null, client) => {
    const productOptions = await options.listByProduct(productId, client);
    if (!productOptions || productOptions.length === 0) {
      throw badRequest("NO_PRODUCT_OPTIONS", "Sản phẩm chưa có tùy chọn (Option) nào để tạo biến thể");
    }

    const valueDetails = await variants.findOptionValuesDetails(optionValueIds, client);
    if (valueDetails.length !== optionValueIds.length) {
      throw badRequest("INVALID_OPTION_VALUE", "Một hoặc nhiều giá trị tùy chọn không tồn tại");
    }

    for (const val of valueDetails) {
      if (Number(val.product_id) !== Number(productId)) {
        throw badRequest("INVALID_OPTION_VALUE", "Giá trị tùy chọn không thuộc về sản phẩm này");
      }
    }

    const optionSeen = new Map();
    for (const val of valueDetails) {
      if (optionSeen.has(val.product_option_id)) {
        throw badRequest("INVALID_OPTION_COMBINATION", "Mỗi tùy chọn chỉ được chọn một giá trị duy nhất");
      }
      optionSeen.set(val.product_option_id, val.product_option_value_id);
    }

    if (optionSeen.size !== productOptions.length) {
      throw badRequest("INCOMPLETE_OPTIONS", "Biến thể phải bao gồm đầy đủ tất cả tùy chọn của sản phẩm");
    }

    // Check duplicate combination across existing variants
    const existingCombinations = await variants.findExistingCombinations(productId, client);
    const sortedRequested = [...optionValueIds].map(Number).sort((a, b) => a - b);

    for (const comb of existingCombinations) {
      if (currentVariantId && Number(comb.product_variant_id) === Number(currentVariantId)) {
        continue;
      }
      const sortedComb = [...comb.option_value_ids].map(Number).sort((a, b) => a - b);
      if (
        sortedRequested.length === sortedComb.length &&
        sortedRequested.every((val, idx) => val === sortedComb[idx])
      ) {
        throw conflict("VARIANT_COMBINATION_EXISTS", "Tổ hợp tùy chọn này đã tồn tại cho một biến thể khác của sản phẩm");
      }
    }
  };

  return {
    async getProductVariants(productId) {
      const product = await products.findById(productId);
      if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
      return variants.listByProduct(productId);
    },

    async getProductVariantById(variantId) {
      const variant = await variants.findById(variantId);
      if (!variant) throw notFound("VARIANT_NOT_FOUND", "Không tìm thấy biến thể sản phẩm");
      return variant;
    },

    async createProductVariant(productId, data, userId) {
      const product = await products.findById(productId);
      if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");

      const normalizedSku = data.sku.trim().toUpperCase();
      const existingSku = await variants.findBySku(normalizedSku);
      if (existingSku) throw conflict("SKU_EXISTS", "Mã SKU đã tồn tại");

      await validateOptionValuesForProduct(productId, data.option_value_ids);

      return transaction(async (client) => {
        const createdVariant = await variants.create(productId, { sku: normalizedSku, price: data.price }, client);
        await variants.createOptionValuesMap(createdVariant.product_variant_id, data.option_value_ids, client);
        await variants.initializeInventory(createdVariant.product_variant_id, client);

        if (audits?.record) {
          await audits.record({
            userId,
            action: "create_product_variant",
            entityName: "product_variant",
            entityId: createdVariant.product_variant_id,
            newData: { ...createdVariant, option_value_ids: data.option_value_ids },
          }, client);
        }

        return variants.findById(createdVariant.product_variant_id, client);
      });
    },

    async updateProductVariant(variantId, data, userId) {
      const existing = await variants.findById(variantId);
      if (!existing) throw notFound("VARIANT_NOT_FOUND", "Không tìm thấy biến thể sản phẩm");

      let normalizedSku = undefined;
      if (data.sku) {
        normalizedSku = data.sku.trim().toUpperCase();
        if (normalizedSku !== existing.sku.toUpperCase()) {
          const existingSku = await variants.findBySku(normalizedSku);
          if (existingSku && Number(existingSku.product_variant_id) !== Number(variantId)) {
            throw conflict("SKU_EXISTS", "Mã SKU đã tồn tại");
          }
        }
      }

      if (data.option_value_ids) {
        await validateOptionValuesForProduct(existing.product_id, data.option_value_ids, variantId);
      }

      return transaction(async (client) => {
        const updatePayload = {
          ...(data.price !== undefined ? { price: data.price } : {}),
          ...(normalizedSku !== undefined ? { sku: normalizedSku } : {}),
        };
        const updated = await variants.update(variantId, updatePayload, client);
        if (data.option_value_ids) {
          await variants.replaceOptionValuesMap(variantId, data.option_value_ids, client);
        }

        if (audits?.record) {
          await audits.record({
            userId,
            action: "update_product_variant",
            entityName: "product_variant",
            entityId: variantId,
            oldData: existing,
            newData: {
              ...updated,
              option_value_ids: data.option_value_ids || (existing.option_values || []).map((v) => v.product_option_value_id),
            },
          }, client);
        }

        return variants.findById(variantId, client);
      });
    },

    async deleteProductVariant(variantId, userId) {
      const existing = await variants.findById(variantId);
      if (!existing) throw notFound("VARIANT_NOT_FOUND", "Không tìm thấy biến thể sản phẩm");

      const hasRef = await variants.hasReferences(variantId);
      if (hasRef) {
        throw conflict("VARIANT_IN_USE", "Không thể xóa biến thể vì đang có dữ liệu đơn hàng hoặc giỏ hàng liên kết");
      }

      return transaction(async (client) => {
        await variants.delete(variantId, client);
        if (audits?.record) {
          await audits.record({
            userId,
            action: "delete_product_variant",
            entityName: "product_variant",
            entityId: variantId,
            oldData: existing,
          }, client);
        }
      });
    },
  };
};

const defaultProductVariantService = createProductVariantService();

export const {
  getProductVariants,
  getProductVariantById,
  createProductVariant,
  updateProductVariant,
  deleteProductVariant,
} = defaultProductVariantService;
