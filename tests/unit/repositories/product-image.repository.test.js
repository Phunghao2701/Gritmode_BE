import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { productImageRepository } from "../../../src/repositories/product-image.repository.js";

afterEach(() => mock.restoreAll());

describe("product image repository", () => {
  test("product image repository handles CRUD, position max, and batch reorder", async () => {
    const sampleImage = {
      product_image_id: 1,
      product_id: 100,
      product_option_value_id: 10,
      url_product_image: "https://example.com/pic.jpg",
      alt_product_image: "Front view",
      position_product_image: 1,
      name_option: "Color",
      value_option: "Black",
    };

    const responses = [
      { rows: [sampleImage] }, // listByProduct
      { rows: [sampleImage] }, // findById
      { rows: [{ max_position: "3" }] }, // getMaxPosition
      { rows: [sampleImage] }, // create
      { rows: [{ ...sampleImage, alt_product_image: "New Alt" }] }, // update
      { rows: [{ ...sampleImage, product_image_id: 1 }, { ...sampleImage, product_image_id: 2 }] }, // findImagesByIds
      { rowCount: 1 }, // updatePositions (img 1)
      { rowCount: 1 }, // updatePositions (img 2)
      { rowCount: 1 }, // delete
    ];

    mock.method(pool, "query", async () => responses.shift());

    const list = await productImageRepository.listByProduct(100);
    assert.equal(list.length, 1);
    assert.equal(list[0].url_product_image, "https://example.com/pic.jpg");

    const single = await productImageRepository.findById(1);
    assert.equal(single.product_image_id, 1);

    const maxPos = await productImageRepository.getMaxPosition(100);
    assert.equal(maxPos, 3);

    const created = await productImageRepository.create(100, {
      url_product_image: "https://example.com/pic.jpg",
      product_option_value_id: 10,
      alt_product_image: "Front view",
      position_product_image: 1,
    });
    assert.equal(created.product_image_id, 1);

    const updated = await productImageRepository.update(1, { alt_product_image: "New Alt" });
    assert.equal(updated.alt_product_image, "New Alt");

    const foundImages = await productImageRepository.findImagesByIds([1, 2]);
    assert.equal(foundImages.length, 2);

    await productImageRepository.updatePositions([
      { product_image_id: 1, position_product_image: 2 },
      { product_image_id: 2, position_product_image: 1 },
    ]);

    const deleted = await productImageRepository.delete(1);
    assert.equal(deleted, true);
  });
});
