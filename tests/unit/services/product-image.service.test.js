import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createProductImageService } from "../../../src/services/product-image.service.js";

describe("product image service", () => {
  const transaction = async (fn) => fn({});

  test("getProductImages returns list or rejects missing product", async () => {
    const service = createProductImageService({
      products: { findById: async (id) => (id === 100 ? { product_id: 100 } : null) },
      images: {
        listByProduct: async (id) => [{ product_image_id: 1, product_id: id, url_product_image: "url" }],
      },
      transaction,
    });

    const list = await service.getProductImages(100);
    assert.equal(list.length, 1);

    await assert.rejects(
      service.getProductImages(999),
      (e) => e.code === "PRODUCT_NOT_FOUND" && e.statusCode === 404,
    );
  });

  test("createProductImage validates option value ownership and auto computes position", async () => {
    let capturedData = null;
    let recordedAudit = false;

    const service = createProductImageService({
      products: { findById: async (id) => (id === 100 ? { product_id: 100 } : null) },
      options: {
        findValueById: async (id) => {
          if (id === 10) return { product_option_value_id: 10, product_id: 100 };
          if (id === 99) return { product_option_value_id: 99, product_id: 200 }; // foreign product
          return null;
        },
      },
      images: {
        getMaxPosition: async () => 3,
        create: async (productId, data) => {
          capturedData = { productId, ...data };
          return { product_image_id: 1, ...capturedData };
        },
      },
      audits: { record: async () => { recordedAudit = true; } },
      transaction,
    });

    // Foreign option value rejected
    await assert.rejects(
      service.createProductImage(100, { url_product_image: "url", product_option_value_id: 99 }),
      (e) => e.code === "INVALID_OPTION_VALUE" && e.statusCode === 400,
    );

    // Missing option value rejected
    await assert.rejects(
      service.createProductImage(100, { url_product_image: "url", product_option_value_id: 999 }),
      (e) => e.code === "INVALID_OPTION_VALUE" && e.statusCode === 400,
    );

    // Auto position assignment (3 + 1 = 4)
    const created = await service.createProductImage(
      100,
      { url_product_image: "https://example.com/pic.jpg", product_option_value_id: 10 },
      "admin-id",
    );

    assert.equal(created.position_product_image, 4);
    assert.equal(recordedAudit, true);
  });

  test("updateProductImage validates option value and updates image", async () => {
    let updatedAudit = false;
    const existingImage = {
      product_image_id: 1,
      product_id: 100,
      product_option_value_id: null,
      url_product_image: "old_url",
    };

    const service = createProductImageService({
      options: {
        findValueById: async (id) => (id === 10 ? { product_option_value_id: 10, product_id: 100 } : null),
      },
      images: {
        findById: async (id) => (id === 1 ? existingImage : null),
        update: async (id, data) => ({ ...existingImage, ...data }),
      },
      audits: { record: async () => { updatedAudit = true; } },
      transaction,
    });

    await assert.rejects(
      service.updateProductImage(999, { alt_product_image: "alt" }),
      (e) => e.code === "IMAGE_NOT_FOUND" && e.statusCode === 404,
    );

    const updated = await service.updateProductImage(
      1,
      { product_option_value_id: 10, alt_product_image: "New Alt" },
      "admin-id",
    );

    assert.equal(updated.product_option_value_id, 10);
    assert.equal(updated.alt_product_image, "New Alt");
    assert.equal(updatedAudit, true);
  });

  test("deleteProductImage deletes image and writes audit log", async () => {
    let deletedAudit = false;
    const service = createProductImageService({
      images: {
        findById: async (id) => (id === 1 ? { product_image_id: 1, product_id: 100 } : null),
        delete: async () => true,
      },
      audits: { record: async () => { deletedAudit = true; } },
      transaction,
    });

    await assert.rejects(
      service.deleteProductImage(999),
      (e) => e.code === "IMAGE_NOT_FOUND" && e.statusCode === 404,
    );

    await service.deleteProductImage(1, "admin-id");
    assert.equal(deletedAudit, true);
  });

  test("reorderProductImages checks product existence and foreign images", async () => {
    let positionsUpdated = false;
    const service = createProductImageService({
      products: { findById: async (id) => (id === 100 ? { product_id: 100 } : null) },
      images: {
        findImagesByIds: async (ids) => {
          if (ids.includes(99)) {
            return [{ product_image_id: 99, product_id: 200 }]; // foreign
          }
          return ids.map((id) => ({ product_image_id: id, product_id: 100 }));
        },
        updatePositions: async () => { positionsUpdated = true; },
        listByProduct: async () => [{ product_image_id: 1, position_product_image: 1 }],
      },
      audits: { record: async () => {} },
      transaction,
    });

    // Product not found
    await assert.rejects(
      service.reorderProductImages(999, [{ product_image_id: 1, position_product_image: 1 }]),
      (e) => e.code === "PRODUCT_NOT_FOUND" && e.statusCode === 404,
    );

    // Foreign image in reorder list
    await assert.rejects(
      service.reorderProductImages(100, [{ product_image_id: 99, position_product_image: 1 }]),
      (e) => e.code === "INVALID_REORDER_IMAGES" && e.statusCode === 400,
    );

    const reordered = await service.reorderProductImages(100, [
      { product_image_id: 1, position_product_image: 2 },
      { product_image_id: 2, position_product_image: 1 },
    ], "admin-id");

    assert.equal(positionsUpdated, true);
    assert.equal(reordered.length, 1);
  });
});
