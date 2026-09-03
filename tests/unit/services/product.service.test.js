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
  status_product: "active",
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

  test("getAdminProducts excludes soft-deleted products", async () => {
    let capturedFilters;
    const service = createProductService({
      products: {
        countProducts: async (filters) => {
          capturedFilters = filters;
          return 0;
        },
        findProducts: async () => [],
      },
      audit: {},
      transaction,
    });

    await service.getAdminProducts();
    assert.equal(capturedFilters.exclude_status_product, "archived");
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

  test("public detail hides draft while admin detail can read it", async () => {
    const draft = { ...sampleDetail, status_product: "draft" };
    const service = createProductService({ products: { findDetail: async () => draft }, audit: {}, transaction });
    await assert.rejects(service.getProductById(1), (error) => error.code === "PRODUCT_NOT_FOUND");
    assert.equal((await service.getAdminProductById(1)).status_product, "draft");
  });

  test("publish rejects incomplete draft and activates complete product", async () => {
    let readiness = { variant_count: 0, invalid_variant_count: 0, category_count: 0, primary_category_count: 0, image_count: 0, incomplete_variant_count: 0 };
    let status = "draft";
    const service = createProductService({
      products: {
        findById: async () => ({ ...sampleProduct, status_product: status }),
        getPublishReadiness: async () => readiness,
        updateStatus: async (_id, nextStatus) => ({ ...sampleProduct, status_product: nextStatus }),
      },
      audit: { log: async () => {} }, transaction,
    });
    await assert.rejects(service.publishProduct(1, "admin-1"), (error) => error.code === "PRODUCT_NOT_READY" && error.details.missing.includes("variants"));
    readiness = { variant_count: 1, invalid_variant_count: 0, category_count: 1, primary_category_count: 1, image_count: 1, incomplete_variant_count: 0 };
    assert.equal((await service.publishProduct(1, "admin-1")).status_product, "active");
    status = "active";
    assert.equal((await service.archiveProduct(1, "admin-1")).status_product, "archived");
  });

  test("createFullProduct creates every relation in one transaction", async () => {
    let transactionCalls = 0;
    let auditEntry = null;
    const client = { transaction: true };
    const transaction = async (fn) => {
      transactionCalls += 1;
      return fn(client);
    };
    const service = createProductService({
      products: { create: async () => ({ product_id: 10, name_product: "Essential Tee" }) },
      options: {
        create: async (_productId, data) => ({ product_option_id: data.name_option === "Color" ? 20 : 21, ...data }),
        createValue: async (optionId, data) => ({ product_option_value_id: optionId === 20 ? 30 : 31, ...data }),
      },
      variants: {
        findBySku: async () => null,
        create: async (_productId, data) => ({ product_variant_id: 40, sku: data.sku, price: data.price }),
        createOptionValuesMap: async () => {},
        initializeInventory: async () => {},
      },
      inventories: { updateStock: async (_variantId, quantity) => ({ quantity_stock: quantity }) },
      images: { create: async (_productId, data) => ({ product_image_id: 50, ...data }) },
      categories: {
        findById: async () => ({ category_id: 2 }),
        assignProduct: async (productId, categoryId, isPrimary) => ({ product_id: productId, category_id: categoryId, is_primary: isPrimary }),
      },
      audit: { log: async (entry) => { auditEntry = entry; } },
      transaction,
    });

    const result = await service.createFullProduct({
      name_product: "Essential Tee",
      description: null,
      options: [{ name_option: "Color", values: ["Black"] }, { name_option: "Size", values: ["M"] }],
      variants: [{ sku: "TEE-BLK-M", price: 450000, quantity_stock: 12, option_values: { Color: "Black", Size: "M" } }],
      images: [{ url_product_image: "https://example.com/a.jpg", option_value: { option_name: "Color", value: "Black" } }],
      category_ids: [2],
      primary_category_id: 2,
    }, "admin-1");

    assert.equal(transactionCalls, 1);
    assert.equal(result.variants[0].inventory.quantity_stock, 12);
    assert.equal(result.images[0].product_option_value_id, 30);
    assert.equal(result.categories[0].is_primary, true);
    assert.equal(auditEntry.action, "create_full_product");
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

  test("deleteProduct archives products without deleting linked data", async () => {
    let archivedId = null;
    let auditEntry = null;

    const service = createProductService({
      products: {
        findById: async (id) => id === 3
          ? { ...sampleProduct, status_product: "archived" }
          : (id === 1 || id === 2 ? sampleProduct : null),
        updateStatus: async (id, status) => {
          archivedId = id;
          return { ...sampleProduct, status_product: status };
        },
      },
      audit: {
        log: async (entry) => {
          auditEntry = entry;
        },
      },
      transaction,
    });

    await assert.rejects(
      service.deleteProduct(999, "admin-1"),
      (error) => error.code === "PRODUCT_NOT_FOUND",
    );

    const deleted = await service.deleteProduct(2, "admin-1");
    assert.equal(archivedId, 2);
    assert.equal(deleted.status_product, "archived");
    assert.equal(auditEntry.action, "soft_delete_product");

    const alreadyArchived = await service.deleteProduct(3, "admin-1");
    assert.equal(alreadyArchived.status_product, "archived");
    assert.equal(archivedId, 2);
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

  test("publishProductLegacy and archiveProductLegacy update status with audit", async () => {
    let updatedStatus = null;
    let auditAction = null;

    const service = createProductService({
      products: {
        findById: async (id) => (id === 1 ? sampleProduct : null),
        updateStatus: async (id, status) => {
          updatedStatus = status;
          return { ...sampleProduct, status_product: status };
        },
      },
      audit: {
        log: async (entry) => {
          auditAction = entry.action;
        },
      },
      transaction,
    });

    const pub = await service.publishProductLegacy(1, "admin-1");
    assert.equal(pub.status_product, "active");
    assert.equal(auditAction, "publish_product");

    const arch = await service.archiveProductLegacy(1, "admin-1");
    assert.equal(arch.status_product, "archived");
    assert.equal(auditAction, "archive_product");

    await assert.rejects(service.publishProductLegacy(999, "admin-1"), (e) => e.code === "PRODUCT_NOT_FOUND");
    await assert.rejects(service.archiveProductLegacy(999, "admin-1"), (e) => e.code === "PRODUCT_NOT_FOUND");
  });

  test("updateFullProduct validates categories, collections, and variant ownership", async () => {
    const service = createProductService({
      products: {
        findDetail: async (id) => (id === 1 ? sampleDetail : null),
        update: async () => {},
        deleteImagesByProduct: async () => {},
        replaceCategories: async () => {},
        replaceCollections: async () => {},
        deleteUnusedOptions: async () => {},
      },
      categories: {
        findById: async (id) => (id === 1 ? { category_id: 1 } : null),
      },
      collections: {
        findById: async (id) => (id === 1 ? { collection_id: 1 } : null),
      },
      variants: {
        findBySku: async (sku) => (sku === "EXISTS" ? { product_variant_id: 999 } : null),
        hasReferences: async (id) => id === 101,
      },
      transaction,
    });

    // Product not found
    await assert.rejects(
      service.updateFullProduct(999, { category_ids: [1], variants: [] }, "admin-1"),
      (e) => e.code === "PRODUCT_NOT_FOUND",
    );

    // Category not found
    await assert.rejects(
      service.updateFullProduct(1, { category_ids: [999], variants: [] }, "admin-1"),
      (e) => e.code === "CATEGORY_NOT_FOUND",
    );

    // Collection not found
    await assert.rejects(
      service.updateFullProduct(1, { category_ids: [1], collection_ids: [999], variants: [] }, "admin-1"),
      (e) => e.code === "COLLECTION_NOT_FOUND",
    );

    // Variant not in product
    await assert.rejects(
      service.updateFullProduct(1, { category_ids: [1], variants: [{ product_variant_id: 888, sku: "SKU1" }] }, "admin-1"),
      (e) => e.code === "VARIANT_NOT_IN_PRODUCT",
    );

    // Duplicate SKU
    await assert.rejects(
      service.updateFullProduct(1, { category_ids: [1], variants: [{ product_variant_id: 101, sku: "EXISTS" }] }, "admin-1"),
      (e) => e.code === "SKU_ALREADY_EXISTS",
    );
  });
});
