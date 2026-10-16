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

test("asset upload starts source and derivative uploads concurrently", async () => {
  const started = [];
  let resolveSource;
  let resolveDerivative;
  const sourceUpload = new Promise((resolve) => { resolveSource = resolve; });
  const derivativeUpload = new Promise((resolve) => { resolveDerivative = resolve; });
  const service = createCloudinaryAssetService({
    normalize: async () => ({ buffer: Buffer.from("normalized"), width: 900, height: 1200, format: "webp" }),
    uploader: {
      uploadBuffer: (_buffer, options) => {
        const isSource = options.folder.includes("/sources");
        started.push(isSource ? "source" : "derivative");
        return isSource ? sourceUpload : derivativeUpload;
      },
    },
  });

  const uploadPromise = service.upload({ buffer: Buffer.from("source"), profile: "product" });
  await Promise.resolve();
  assert.deepEqual(started, ["source", "derivative"]);

  resolveSource({ public_id: "products/source-concurrent", secure_url: "https://cdn.test/source.webp" });
  resolveDerivative({ secure_url: "https://cdn.test/product-concurrent.webp", public_id: "products/concurrent", bytes: 11 });
  const result = await uploadPromise;

  assert.equal(result.cloudinary_public_id, "products/concurrent");
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

test("asset upload compensates both completed uploads when the other upload fails", async () => {
  const deleted = [];
  const service = createCloudinaryAssetService({
    normalize: async () => ({ buffer: Buffer.from("normalized"), width: 3, height: 4, format: "webp" }),
    uploader: {
      uploadBuffer: async (_buffer, options) => {
        if (options.folder.includes("/sources")) return { public_id: "products/source-b" };
        throw new Error("derivative upload failed");
      },
    },
    destroy: async (publicId) => deleted.push(publicId),
  });

  await assert.rejects(
    service.upload({ buffer: Buffer.from("source"), profile: "product" }),
    /derivative upload failed/,
  );
  assert.deepEqual(deleted, ["products/source-b"]);
});
