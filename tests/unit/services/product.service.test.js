import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createProductService } from "../../../src/services/product.service.js";

const sampleProduct = {
  product_id: 1,
  name_product: "Logo T-Shirt",
  description: "Oversized Cotton",
  created_at: new Date(),
  updated_at: new Date(),
};

const sampleDetail = {
  ...sampleProduct,
  images: [{ product_image_id: 1, url_product_image: "https://img.jpg" }],
  options: [{ product_option_id: 1, name_option: "Color", values: [{ product_option_value_id: 1, value_option: "Black" }] }],
  variants: [{ product_variant_id: 101, sku: "TS-BLK-M", price: 550000, quantity_available: 10, option_values: [] }],
  categories: [{ category_id: 1, name_category: "Tops", is_primary: true }],
  collections: [{ collection_id: 1, name_collection: "Summer" }],
};

describe("product service", () => {
  const transaction = async (fn) => fn({});

  test("getProducts calculates pagination and filters correctly", async () => {
    let capturedFilters = null;
    let capturedPagination = null;
    let capturedSort = null;

    const service = createProductService({
      products: {
        countProducts: async (filters) => {
          capturedFilters = filters;
          return 45;
        },
        findProducts: async (filters, pagination, sort) => {
          capturedPagination = pagination;
          capturedSort = sort;
          return [sampleProduct];
        },
      },
      audit: {},
      transaction,
    });

    const result = await service.getProducts({
      page: 2,
      limit: 10,
      search: "shirt",
      category_id: 2,
      sort: "price_asc",
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.pagination.page, 2);
    assert.equal(result.pagination.limit, 10);
    assert.equal(result.pagination.total, 45);
    assert.equal(result.pagination.total_pages, 5);
    assert.equal(capturedFilters.search, "shirt");
    assert.equal(capturedFilters.category_id, 2);
    assert.equal(capturedPagination.page, 2);
    assert.equal(capturedSort, "price_asc");
  });

  test("getProductById returns full detail or throws not found", async () => {
    const service = createProductService({
      products: {
        findDetail: async (id) => (id === 1 ? sampleDetail : null),
      },
      audit: {},
      transaction,
    });

    const detail = await service.getProductById(1);
    assert.equal(detail.product_id, 1);
    assert.equal(detail.options.length, 1);
    assert.equal(detail.variants.length, 1);

    await assert.rejects(
      service.getProductById(999),
      (error) => error.code === "PRODUCT_NOT_FOUND" && error.statusCode === 404,
    );
  });

  test("createProduct creates product and writes audit log", async () => {
    let auditEntry = null;
    const service = createProductService({
      products: {
        create: async (data) => ({ product_id: 10, ...data }),
      },
      audit: {
        log: async (entry) => {
          auditEntry = entry;
        },
      },
      transaction,
    });

    const created = await service.createProduct({ name_product: "New Product" }, "admin-1");
    assert.equal(created.product_id, 10);
    assert.equal(created.name_product, "New Product");
    assert.equal(auditEntry.action, "create_product");
    assert.equal(auditEntry.userId, "admin-1");
  });

  test("updateProduct updates existing product and logs audit diff", async () => {
    let auditEntry = null;
    const service = createProductService({
      products: {
        findById: async (id) => (id === 1 ? sampleProduct : null),
        update: async (id, data) => ({ ...sampleProduct, ...data }),
      },
      audit: {
        log: async (entry) => {
          auditEntry = entry;
        },
      },
      transaction,
    });

    const updated = await service.updateProduct(1, { name_product: "Updated" }, "admin-1");
    assert.equal(updated.name_product, "Updated");
    assert.equal(auditEntry.action, "update_product");
    assert.equal(auditEntry.oldData.name_product, "Logo T-Shirt");
    assert.equal(auditEntry.newData.name_product, "Updated");

    await assert.rejects(
      service.updateProduct(999, {}, "admin-1"),
      (e) => e.code === "PRODUCT_NOT_FOUND",
    );
  });

  test("deleteProduct rejects referenced products and deletes clean products", async () => {
    let deletedId = null;
    let auditEntry = null;

    const service = createProductService({
      products: {
        findById: async (id) => (id === 1 || id === 2 ? sampleProduct : null),
        hasReferences: async (id) => id === 2,
        delete: async (id) => {
          deletedId = id;
          return true;
        },
      },
      audit: {
        log: async (entry) => {
          auditEntry = entry;
        },
      },
      transaction,
    });

    // Deleting referenced product #2 throws 409
    await assert.rejects(
      service.deleteProduct(2, "admin-1"),
      (error) => error.code === "PRODUCT_HAS_REFERENCES" && error.statusCode === 409,
    );

    // Deleting missing product #999 throws 404
    await assert.rejects(
      service.deleteProduct(999, "admin-1"),
      (error) => error.code === "PRODUCT_NOT_FOUND",
    );

    // Deleting clean product #1 succeeds
    await service.deleteProduct(1, "admin-1");
    assert.equal(deletedId, 1);
    assert.equal(auditEntry.action, "delete_product");
  });

  test("productExists returns boolean existence", async () => {
    const service = createProductService({
      products: {
        findById: async (id) => (id === 1 ? sampleProduct : null),
      },
      audit: {},
      transaction,
    });

    assert.equal(await service.productExists(1), true);
    assert.equal(await service.productExists(999), false);
  });
});
