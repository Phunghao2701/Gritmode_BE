import { test } from "node:test";
import assert from "node:assert/strict";
import { createBannerService } from "../../../src/services/banner.service.js";

test("banner asset service passes metadata through the domain mutation", async () => {
  const calls = [];
  const service = createBannerService({
    banners: { create: async (payload) => { calls.push(payload); return payload; } },
    cache: { del: async () => {} },
    transaction: async (callback) => callback({}),
  });
  const result = await service.addHeroImage({
    image_url: "https://cdn.test/banner.webp",
    cloudinary_public_id: "banners/1",
    crop_profile: "banner",
    image_width: 1600,
    image_height: 900,
    image_format: "webp",
  });
  assert.equal(result.crop_profile, "banner");
  assert.equal(calls[0].cloudinary_public_id, "banners/1");
});

test("banner asset service retains the source URL for future recrops", async () => {
  const calls = [];
  const service = createBannerService({
    banners: { create: async (payload) => { calls.push(payload); return payload; } },
    mediaAssets: {
      findById: async () => ({
        status: "staged",
        asset_type: "banner",
        url: "https://cdn.test/banner.webp",
        cloudinary_public_id: "banners/1",
        cloudinary_source_public_id: "gritmode/banner/sources/1",
        cloudinary_source_url: "https://cdn.test/banner-source.webp",
        crop_profile: "banner",
        image_width: 1920,
        image_height: 1080,
        image_format: "webp",
      }),
      attach: async () => true,
    },
    cache: { del: async () => {} },
    transaction: async (callback) => callback({}),
  });

  await service.addHeroImage({
    media_asset_id: 12,
    image_url: "https://cdn.test/banner.webp",
  });

  assert.equal(calls[0].cloudinary_source_url, "https://cdn.test/banner-source.webp");
});

test("banner recrop keeps the row and cleans the old derivative after commit", async () => {
  const cleaned = [];
  const existing = { banner_id: 4, image_url: "https://cdn.test/old.webp", cloudinary_public_id: "banners/old" };
  const service = createBannerService({
    banners: {
      findById: async () => existing,
      updateImage: async (_id, payload) => ({ ...existing, ...payload, cloudinary_public_id: "banners/new" }),
    },
    mediaLifecycle: { cleanupAfterCommit: async (id) => cleaned.push(id) },
    cache: { del: async () => {} },
    transaction: async (callback) => callback({}),
  });

  const updated = await service.updateHeroImage(4, {
    image_url: "https://cdn.test/new.webp",
    cloudinary_public_id: "banners/new",
    crop_profile: "banner",
  });

  assert.equal(updated.cloudinary_public_id, "banners/new");
  assert.deepEqual(cleaned, ["banners/old"]);
});

test("banner reorder requires a complete contiguous set of positions", async () => {
  const service = createBannerService({
    banners: {
      listAll: async () => [{ banner_id: 1 }, { banner_id: 2 }],
      updateSortOrders: async (items) => items,
    },
    cache: { del: async () => {} },
    transaction: async (callback) => callback({}),
  });

  await assert.rejects(
    service.reorderImages([{ banner_id: 1, sort_order: 1 }, { banner_id: 2, sort_order: 2 }]),
    (error) => error.code === "INVALID_BANNER_ORDER",
  );
  const updated = await service.reorderImages([{ banner_id: 2, sort_order: 0 }, { banner_id: 1, sort_order: 1 }]);
  assert.deepEqual(updated, [{ banner_id: 2, sort_order: 0 }, { banner_id: 1, sort_order: 1 }]);
});
