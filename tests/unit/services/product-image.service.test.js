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

  test("updateProductImage attaches the new cropped media asset", async () => {
    let attached = null;
    let updatedPayload = null;
    let cleanedPublicId = null;
    const existingImage = {
      product_image_id: 1,
      product_id: 100,
      cloudinary_public_id: "products/old-crop",
    };
    const asset = {
      media_asset_id: 55,
      asset_type: "product",
      status: "staged",
      url: "https://cdn.example/new-crop.webp",
      cloudinary_public_id: "products/new-crop",
      cloudinary_source_public_id: "products/source",
      cloudinary_source_url: "https://cdn.example/source.jpg",
      crop_profile: "product",
      image_width: 1200,
      image_height: 1600,
      image_format: "webp",
    };

    const service = createProductImageService({
      images: {
        findById: async () => existingImage,
        update: async (id, data) => {
          updatedPayload = { id, data };
          return { ...existingImage, ...data };
        },
      },
      mediaAssets: {
        findById: async () => asset,
        attach: async (assetId, entityType, entityId) => {
          attached = { assetId, entityType, entityId };
          return true;
        },
      },
      mediaLifecycle: {
        cleanupAfterCommit: async (publicId) => { cleanedPublicId = publicId; },
      },
      audits: { record: async () => {} },
      transaction,
    });

    const updated = await service.updateProductImage(1, { media_asset_id: 55 }, "admin-id");

    assert.equal(updated.url_product_image, asset.url);
    assert.equal(updatedPayload.data.cloudinary_public_id, asset.cloudinary_public_id);
    assert.deepEqual(attached, { assetId: 55, entityType: "product_image", entityId: 1 });
    assert.equal(cleanedPublicId, "products/old-crop");
  });

  test("cropProductImage reuses the retained source and cleans the old derivative asynchronously", async () => {
    const uploadCalls = [];
    const destroyed = [];
    const attached = [];
    const existingImage = {
      product_image_id: 1,
      product_id: 100,
      cloudinary_public_id: "products/old-crop",
      cloudinary_source_public_id: "products/source-master",
      cloudinary_source_url: "https://cdn.example/source.webp",
    };
    const descriptor = {
      url: "https://cdn.example/new-crop.webp",
      cloudinary_public_id: "products/new-crop",
      cloudinary_source_public_id: "products/source-master",
      cloudinary_source_url: "https://cdn.example/source.webp",
      crop_profile: "product",
      image_width: 1200,
      image_height: 1600,
      image_format: "webp",
    };

    const service = createProductImageService({
      images: {
        findById: async () => existingImage,
        update: async (_id, data) => ({ ...existingImage, ...data }),
      },
      mediaAssets: {
        create: async (data) => ({ media_asset_id: 77, ...data }),
        attach: async (assetId, recordType, recordId) => {
          attached.push({ assetId, recordType, recordId });
          return true;
        },
      },
      cloudinary: {
        upload: async (data) => {
          uploadCalls.push(data);
          return descriptor;
        },
        destroy: async (publicId) => destroyed.push(publicId),
      },
      mediaLifecycle: {
        cleanupAfterCommit: async (publicId) => destroyed.push(publicId),
      },
      audits: { record: async () => {} },
      transaction,
    });

    const updated = await service.cropProductImage(1, { buffer: Buffer.from("image"), originalName: "crop.png" }, "admin-id");
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(updated.url_product_image, descriptor.url);
    assert.equal(uploadCalls[0].sourcePublicId, "products/source-master");
    assert.deepEqual(attached, [{ assetId: 77, recordType: "product_image", recordId: 1 }]);
    assert.deepEqual(destroyed, ["products/old-crop"]);
  });

  test("cropProductImage never destroys a retained source when the DB transaction fails", async () => {
    const destroyed = [];
    const service = createProductImageService({
      images: {
        findById: async () => ({
          product_image_id: 1,
          product_id: 100,
          cloudinary_public_id: "products/old-crop",
          cloudinary_source_public_id: "products/source-master",
        }),
        update: async () => { throw new Error("db failed"); },
      },
      mediaAssets: {
        create: async () => ({ media_asset_id: 77 }),
        attach: async () => true,
      },
      cloudinary: {
        upload: async () => ({
          url: "https://cdn.example/new-crop.webp",
          cloudinary_public_id: "products/new-crop",
          cloudinary_source_public_id: "products/source-master",
        }),
        destroy: async (publicId) => destroyed.push(publicId),
      },
      transaction,
    });

    await assert.rejects(
      service.cropProductImage(1, { buffer: Buffer.from("image") }),
      /db failed/,
    );
    assert.deepEqual(destroyed, ["products/new-crop"]);
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
