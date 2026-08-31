import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCreateProductImage,
  validateUpdateProductImage,
  validateReorderProductImages,
} from "../../../src/utils/validation.js";

describe("product image validation primitives", () => {
  test("validateCreateProductImage validates required url and optional fields", () => {
    const invalidUrl = validateCreateProductImage({});
    assert.equal(invalidUrl.ok, false);

    const invalidScriptUrl = validateCreateProductImage({ url_product_image: "javascript:alert(1)" });
    assert.equal(invalidScriptUrl.ok, false);

    const invalidForbidden = validateCreateProductImage({
      url_product_image: "https://example.com/pic.jpg",
      product_id: 1,
    });
    assert.equal(invalidForbidden.ok, false);

    const valid = validateCreateProductImage({
      url_product_image: "https://example.com/pic.jpg",
      product_option_value_id: 10,
      alt_product_image: "Front view",
      position_product_image: 2,
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.url_product_image, "https://example.com/pic.jpg");
    assert.equal(valid.value.product_option_value_id, 10);
    assert.equal(valid.value.alt_product_image, "Front view");
    assert.equal(valid.value.position_product_image, 2);
  });

  test("validateUpdateProductImage validates optional fields and rejects empty payload", () => {
    const empty = validateUpdateProductImage({});
    assert.equal(empty.ok, false);

    const invalidForbidden = validateUpdateProductImage({ product_image_id: 1 });
    assert.equal(invalidForbidden.ok, false);

    const validNullOption = validateUpdateProductImage({
      product_option_value_id: null,
      alt_product_image: null,
      position_product_image: 1,
    });
    assert.equal(validNullOption.ok, true);
    assert.equal(validNullOption.value.product_option_value_id, null);
    assert.equal(validNullOption.value.alt_product_image, null);
    assert.equal(validNullOption.value.position_product_image, 1);
  });

  test("validateReorderProductImages validates array of image positions", () => {
    const invalidEmpty = validateReorderProductImages({});
    assert.equal(invalidEmpty.ok, false);

    const invalidDuplicate = validateReorderProductImages({
      images: [
        { product_image_id: 1, position_product_image: 1 },
        { product_image_id: 1, position_product_image: 2 },
      ],
    });
    assert.equal(invalidDuplicate.ok, false);

    const invalidId = validateReorderProductImages({
      images: [{ product_image_id: "abc", position_product_image: 1 }],
    });
    assert.equal(invalidId.ok, false);

    const valid = validateReorderProductImages({
      images: [
        { product_image_id: 20, position_product_image: 1 },
        { product_image_id: 18, position_product_image: 2 },
      ],
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.images.length, 2);
  });
});
