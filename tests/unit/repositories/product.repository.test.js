import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { productRepository } from "../../../src/repositories/product.repository.js";
import { auditRepository } from "../../../src/repositories/audit.repository.js";

afterEach(() => mock.restoreAll());

describe("product repository", () => {
  test("countProducts and findProducts execute parameterized queries", async () => {
    const responses = [
      { rows: [{ total: 10 }] },
      {
        rows: [
          {
            product_id: 1,
            name_product: "T-Shirt",
            description: "Desc",
            min_price: 100,
            max_price: 200,
            thumbnail: "https://thumb.jpg",
            is_available: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      },
    ];

    const query = mock.method(pool, "query", async () => responses.shift());

    const total = await productRepository.countProducts({ search: "shirt", category_id: 1 });
    assert.equal(total, 10);

    const items = await productRepository.findProducts(
      { search: "shirt", min_price: 50, max_price: 250 },
      { page: 1, limit: 10 },
      "price_asc",
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].min_price, 100);
    assert.equal(items[0].is_available, true);
    assert.equal(query.mock.calls.length, 2);
  });

  test("findById and findDetail aggregate relations properly", async () => {
    const responses = [
      // findById
      { rows: [{ product_id: 1, name_product: "Shirt", description: "Desc", created_at: new Date(), updated_at: new Date() }] },
      // findDetail product base
      { rows: [{ product_id: 1, name_product: "Shirt", description: "Desc", created_at: new Date(), updated_at: new Date() }] },
      // images
      { rows: [{ product_image_id: 10, url_product_image: "url1", product_option_value_id: null, position_product_image: 1 }] },
      // options
      { rows: [{ product_option_id: 20, name_option: "Color", product_option_value_id: 30, value_option: "Black" }] },
      // variants
      {
        rows: [
          {
            product_variant_id: 100,
            sku: "SKU-BLK",
            price: 500,
            quantity_available: 5,
            product_option_value_id: 30,
            value_option: "Black",
          },
        ],
      },
      // categories
      { rows: [{ category_id: 2, name_category: "Tops", is_primary: true }] },
      // collections
      { rows: [{ collection_id: 3, name_collection: "Summer" }] },
    ];

    mock.method(pool, "query", async () => responses.shift());

    const base = await productRepository.findById(1);
    assert.equal(base.product_id, 1);

    const detail = await productRepository.findDetail(1);
    assert.equal(detail.product_id, 1);
    assert.equal(detail.images.length, 1);
    assert.equal(detail.options[0].values[0].value_option, "Black");
    assert.equal(detail.variants[0].sku, "SKU-BLK");
    assert.equal(detail.variants[0].option_values[0].value_option, "Black");
    assert.equal(detail.categories[0].name_category, "Tops");
    assert.equal(detail.collections[0].name_collection, "Summer");
  });

  test("create, update, delete and hasReferences operations", async () => {
    const responses = [
      { rows: [{ product_id: 1, name_product: "Created", description: null, created_at: new Date(), updated_at: new Date() }] },
      { rows: [{ product_id: 1, name_product: "Updated", description: "New Desc", created_at: new Date(), updated_at: new Date() }] },
      { rowCount: 1 },
      { rowCount: 0 },
    ];

    mock.method(pool, "query", async () => responses.shift());

    const created = await productRepository.create({ name_product: "Created" });
    assert.equal(created.name_product, "Created");

    const updated = await productRepository.update(1, { name_product: "Updated", description: "New Desc" });
    assert.equal(updated.name_product, "Updated");

    const deleted = await productRepository.delete(1);
    assert.equal(deleted, true);

    const isReferenced = await productRepository.hasReferences(1);
    assert.equal(isReferenced, false);
  });

  test("auditRepository records admin action log", async () => {
    mock.method(pool, "query", async () => ({
      rows: [
        {
          audit_log_id: 1,
          user_id: "u1",
          action: "create_product",
          entity_name: "product",
          entity_id: "10",
        },
      ],
    }));

    const log = await auditRepository.log({
      userId: "u1",
      action: "create_product",
      entityName: "product",
      entityId: 10,
    });
    assert.equal(log.action, "create_product");
  });
});
