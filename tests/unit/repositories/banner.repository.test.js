import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { bannerRepository } from "../../../src/repositories/banner.repository.js";

afterEach(() => mock.restoreAll());

test("banner repository persists and returns media metadata", async () => {
  const row = {
    banner_id: 1,
    image_url: "https://cdn.test/banner.webp",
    cloudinary_public_id: "banners/1",
    cloudinary_source_public_id: "banners/source-1",
    crop_profile: "banner",
    image_width: 1600,
    image_height: 900,
    image_format: "webp",
  };
  const queries = [];
  mock.method(pool, "query", async (query, values) => {
    queries.push({ query, values });
    return { rows: [row] };
  });

  const created = await bannerRepository.create({ image_url: row.image_url, media: row });
  assert.equal(created.cloudinary_public_id, "banners/1");
  assert.match(queries[0].query, /cloudinary_public_id/);
});
