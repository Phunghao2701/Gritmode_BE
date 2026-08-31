import { conflict, notFound } from "../errors/app-error.js";
import { productRepository } from "../repositories/product.repository.js";
import { productOptionRepository } from "../repositories/product-option.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";

export const createProductOptionService = ({
  products = productRepository,
  options = productOptionRepository,
  audits = auditRepository,
  transaction = withTransaction,
} = {}) => ({
  async getProductOptions(productId) {
    const product = await products.findById(productId);
    if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
    return options.listByProduct(productId);
  },

  async createProductOption(productId, data, userId) {
    const product = await products.findById(productId);
    if (!product) throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");

    const existing = await options.findByNameAndProduct(productId, data.name_option);
    if (existing) throw conflict("OPTION_ALREADY_EXISTS", "Tùy chọn cho sản phẩm này đã tồn tại");

    return transaction(async (client) => {
      const option = await options.create(productId, data, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "create_product_option",
          entityName: "product_option",
          entityId: option.product_option_id,
          newData: option,
        }, client);
      }
      return option;
    });
  },

  async updateProductOption(optionId, data, userId) {
    const existing = await options.findById(optionId);
    if (!existing) throw notFound("OPTION_NOT_FOUND", "Không tìm thấy tùy chọn sản phẩm");

    if (data.name_option && data.name_option.trim().toLowerCase() !== existing.name_option.toLowerCase()) {
      const duplicate = await options.findByNameAndProduct(existing.product_id, data.name_option);
      if (duplicate && duplicate.product_option_id !== existing.product_option_id) {
        throw conflict("OPTION_ALREADY_EXISTS", "Tùy chọn với tên này đã tồn tại trong sản phẩm");
      }
    }

    return transaction(async (client) => {
      const updated = await options.update(optionId, data, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "update_product_option",
          entityName: "product_option",
          entityId: optionId,
          oldData: existing,
          newData: updated,
        }, client);
      }
      return updated;
    });
  },

  async deleteProductOption(optionId, userId) {
    const existing = await options.findById(optionId);
    if (!existing) throw notFound("OPTION_NOT_FOUND", "Không tìm thấy tùy chọn sản phẩm");

    const isUsed = await options.isUsedInVariants(optionId);
    if (isUsed) {
      throw conflict("OPTION_IN_USE", "Tùy chọn này đang được sử dụng bởi các biến thể sản phẩm");
    }

    return transaction(async (client) => {
      await options.delete(optionId, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "delete_product_option",
          entityName: "product_option",
          entityId: optionId,
          oldData: existing,
        }, client);
      }
    });
  },

  async createOptionValue(optionId, data, userId) {
    const option = await options.findById(optionId);
    if (!option) throw notFound("OPTION_NOT_FOUND", "Không tìm thấy tùy chọn sản phẩm");

    const existing = await options.findValueByNameAndOption(optionId, data.value_option);
    if (existing) throw conflict("OPTION_VALUE_ALREADY_EXISTS", "Giá trị tùy chọn này đã tồn tại");

    return transaction(async (client) => {
      const value = await options.createValue(optionId, data, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "create_product_option_value",
          entityName: "product_option_value",
          entityId: value.product_option_value_id,
          newData: value,
        }, client);
      }
      return value;
    });
  },

  async updateOptionValue(valueId, data, userId) {
    const existing = await options.findValueById(valueId);
    if (!existing) throw notFound("OPTION_VALUE_NOT_FOUND", "Không tìm thấy giá trị tùy chọn");

    if (data.value_option && data.value_option.trim().toLowerCase() !== existing.value_option.toLowerCase()) {
      const duplicate = await options.findValueByNameAndOption(existing.product_option_id, data.value_option);
      if (duplicate && duplicate.product_option_value_id !== existing.product_option_value_id) {
        throw conflict("OPTION_VALUE_ALREADY_EXISTS", "Giá trị tùy chọn này đã tồn tại");
      }
    }

    return transaction(async (client) => {
      const updated = await options.updateValue(valueId, data, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "update_product_option_value",
          entityName: "product_option_value",
          entityId: valueId,
          oldData: existing,
          newData: updated,
        }, client);
      }
      return updated;
    });
  },

  async deleteOptionValue(valueId, userId) {
    const existing = await options.findValueById(valueId);
    if (!existing) throw notFound("OPTION_VALUE_NOT_FOUND", "Không tìm thấy giá trị tùy chọn");

    const isUsed = await options.isValueUsedInVariants(valueId);
    if (isUsed) {
      throw conflict("OPTION_VALUE_IN_USE", "Giá trị tùy chọn này đang được sử dụng bởi các biến thể sản phẩm");
    }

    return transaction(async (client) => {
      await options.deleteValue(valueId, client);
      if (audits?.record) {
        await audits.record({
          userId,
          action: "delete_product_option_value",
          entityName: "product_option_value",
          entityId: valueId,
          oldData: existing,
        }, client);
      }
    });
  },
});

const defaultProductOptionService = createProductOptionService();

export const {
  getProductOptions,
  createProductOption,
  updateProductOption,
  deleteProductOption,
  createOptionValue,
  updateOptionValue,
  deleteOptionValue,
} = defaultProductOptionService;
