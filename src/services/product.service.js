import { conflict, notFound } from "../errors/app-error.js";
import { productRepository } from "../repositories/product.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";

export const createProductService = ({
  products = productRepository,
  audit = auditRepository,
  transaction = withTransaction,
} = {}) => ({
  async getProducts(query = {}) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const pagination = { page, limit };
    const filters = {
      search: query.search,
      category_id: query.category_id,
      collection_id: query.collection_id,
      min_price: query.min_price,
      max_price: query.max_price,
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

  async getProductById(productId) {
    const product = await products.findDetail(productId);
    if (!product) {
      throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
    }
    return product;
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

  async deleteProduct(productId, adminUserId) {
    return transaction(async (client) => {
      const existing = await products.findById(productId, client);
      if (!existing) {
        throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
      }

      const isReferenced = products.hasReferences ? await products.hasReferences(productId, client) : false;
      if (isReferenced) {
        throw conflict("PRODUCT_HAS_REFERENCES", "Sản phẩm không thể xóa do có dữ liệu liên kết");
      }

      const deleted = await products.delete(productId, client);
      if (!deleted) {
        throw notFound("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm");
      }

      if (audit?.log) {
        await audit.log(
          {
            userId: adminUserId,
            action: "delete_product",
            entityName: "product",
            entityId: productId,
            oldData: existing,
          },
          client,
        );
      }
    });
  },

  async productExists(productId) {
    const existing = await products.findById(productId);
    return Boolean(existing);
  },
});

const defaultProductService = createProductService();

export const getProducts = (query) => defaultProductService.getProducts(query);
export const getProductById = (productId) => defaultProductService.getProductById(productId);
export const createProduct = (input, adminUserId) => defaultProductService.createProduct(input, adminUserId);
export const updateProduct = (productId, input, adminUserId) => defaultProductService.updateProduct(productId, input, adminUserId);
export const deleteProduct = (productId, adminUserId) => defaultProductService.deleteProduct(productId, adminUserId);
export const productExists = (productId) => defaultProductService.productExists(productId);
