import test from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_PROFILES,
  getImageProfile,
  assertImageDimensions,
} from "../../../src/utils/image-profiles.js";

test("image profiles expose the agreed target ratios", () => {
  assert.deepEqual(IMAGE_PROFILES.product, { key: "product", width: 3, height: 4, folder: "products", outputWidth: 1200, outputHeight: 1600 });
  assert.deepEqual(IMAGE_PROFILES.collection, { key: "collection", width: 4, height: 3, folder: "collections", outputWidth: 1600, outputHeight: 1200 });
  assert.deepEqual(IMAGE_PROFILES.banner, { key: "banner", width: 16, height: 9, folder: "banners", outputWidth: 1920, outputHeight: 1080 });
});

test("unknown profiles and mismatched dimensions are rejected", () => {
  assert.throws(() => getImageProfile("unknown"), /Unsupported image profile/);
  assert.throws(() => assertImageDimensions("product", 4, 3), /dimensions do not match/);
  assert.doesNotThrow(() => assertImageDimensions("product", 1200, 1600));
});
