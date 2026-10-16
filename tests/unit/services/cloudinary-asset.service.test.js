import test from "node:test";
import assert from "node:assert/strict";
import { createCloudinaryAssetService } from "../../../src/services/cloudinary-asset.service.js";

test("asset upload returns a profile-aware descriptor", async () => {
  const service = createCloudinaryAssetService({
    normalize: async () => ({ buffer: Buffer.from("normalized"), width: 900, height: 1200, format: "webp" }),
    uploader: { uploadBuffer: async (_buffer, options) => options.folder.includes('/sources')
      ? ({ public_id: "products/source-abc", secure_url: "https://cdn.test/source.webp" })
      : ({ secure_url: "https://cdn.test/product.webp", public_id: "products/abc", bytes: 10 }) },
  });

  const result = await service.upload({ buffer: Buffer.from("source"), profile: "product", originalName: "shirt.jpg" });
  assert.deepEqual(result, {
    url: "https://cdn.test/product.webp",
    cloudinary_public_id: "products/abc",
    cloudinary_source_public_id: "products/source-abc",
    cloudinary_source_url: "https://cdn.test/source.webp",
    crop_profile: "product",
    image_width: 900,
    image_height: 1200,
    image_format: "webp",
    original_name: "shirt.jpg",
    size: 10,
  });
});

test("database attachment failure compensates the new external asset", async () => {
  const deleted = [];
  const service = createCloudinaryAssetService({
    normalize: async () => ({ buffer: Buffer.from("normalized"), width: 3, height: 4, format: "webp" }),
    uploader: { uploadBuffer: async (_buffer, options) => options.folder.includes('/sources')
      ? ({ public_id: "products/source-a" })
      : ({ secure_url: "https://cdn.test/a.webp", public_id: "products/a" }) },
    destroy: async (publicId) => deleted.push(publicId),
  });

  await assert.rejects(
    service.uploadAndAttach({ buffer: Buffer.from("source"), profile: "product", attach: async () => { throw new Error("db failed"); } }),
    /db failed/,
  );
  assert.deepEqual(deleted, ["products/a", "products/source-a"]);
});
