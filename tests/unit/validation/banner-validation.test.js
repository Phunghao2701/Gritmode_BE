import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateBannerImagePayload,
  validateBannerOrderPayload,
  validateBannerStatusPayload,
  validateHeroContent,
} from "../../../src/utils/validation.js";

describe("banner validation", () => {
  test("normalizes valid hero content and rejects an empty title", () => {
    const valid = validateHeroContent({ title: "  Signature  ", description: "  Hero  " });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.title, "Signature");
    assert.equal(valid.value.description, "Hero");

    const invalid = validateHeroContent({ title: "   " });
    assert.equal(invalid.ok, false);
  });

  test("validates banner image payload and status", () => {
    const image = validateBannerImagePayload({ image_url: " https://cdn.test/banner.webp ", sort_order: "2" });
    assert.deepEqual(image.value, { image_url: "https://cdn.test/banner.webp", sort_order: 2 });
    assert.equal(validateBannerStatusPayload({ is_active: true }).ok, true);
    assert.equal(validateBannerStatusPayload({ is_active: "true" }).ok, false);
  });

  test("normalizes reorder items and rejects invalid ids", () => {
    const valid = validateBannerOrderPayload({ items: [{ banner_id: "10" }] });
    assert.deepEqual(valid.value.items, [{ banner_id: 10, sort_order: 0 }]);
    assert.equal(validateBannerOrderPayload({ items: [{ banner_id: 0 }] }).ok, false);
  });
});
