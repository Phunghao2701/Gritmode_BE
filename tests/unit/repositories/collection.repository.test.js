import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { collectionRepository } from "../../../src/repositories/collection.repository.js";

describe("collection repository", () => {
  test("collection repository handles CRUD, lookups, product links, and positions", async () => {
    const sampleCollection = {
      collection_id: 1,
      name_collection: "Dragon Ball Z",
      slug_collection: "dragon-ball-z",
      description_collection: "DBZ Drop",
      image_collection: "https://example.com/dbz.jpg",
      position_collection: 1,
      is_active: true,
      start_at: null,
      end_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockClient = {
      query: async (sql, params) => {
        const sqlStr = String(sql);
        if (sqlStr.includes("DELETE") || sqlStr.includes("UPDATE product_collection")) {
          return { rowCount: 1, rows: [] };
        }
        if (sqlStr.includes("MAX(position_product_collection)")) {
          return { rows: [{ max_pos: "5" }] };
        }
        if (sqlStr.includes("JOIN product p ON")) {
          return { rows: [{ product_id: 888, name_product: "Goku T-Shirt", position_product_collection: 1 }] };
        }
        if (sqlStr.includes("SET is_active = $1")) {
          return { rows: [{ ...sampleCollection, is_active: Boolean(params?.[0]) }] };
        }
        if (sqlStr.includes("SELECT c.collection_id") || sqlStr.includes("FROM collection c")) {
          return { rows: [sampleCollection] };
        }
        if (sqlStr.includes("UPDATE collection")) {
          return { rows: [{ ...sampleCollection, name_collection: "Dragon Ball Super" }] };
        }
        if (sqlStr.includes("INSERT INTO collection")) {
          return { rows: [sampleCollection] };
        }
        if (sqlStr.includes("INSERT INTO product_collection")) {
          return { rows: [{ product_id: 888, collection_id: 777, position_product_collection: Number(params?.[2] || 0) }] };
        }
        if (sqlStr.includes("product_collection")) {
          return { rows: [{ product_id: 888, collection_id: 777, position_product_collection: 1 }] };
        }
        return { rows: [sampleCollection] };
      },
    };

    const visibleList = await collectionRepository.listVisible(mockClient);
    assert.equal(visibleList.length, 1);
    assert.equal(visibleList[0].slug_collection, "dragon-ball-z");

    const allList = await collectionRepository.listAll({}, mockClient);
    assert.equal(allList.length, 1);

    const foundById = await collectionRepository.findById(1, mockClient);
    assert.equal(foundById.collection_id, 1);

    const foundBySlug = await collectionRepository.findBySlug("dragon-ball-z", mockClient);
    assert.equal(foundBySlug.slug_collection, "dragon-ball-z");

    const created = await collectionRepository.create({
      name_collection: "Dragon Ball Z",
      slug_collection: "dragon-ball-z",
    }, mockClient);
    assert.equal(created.name_collection, "Dragon Ball Z");

    const updated = await collectionRepository.update(1, { name_collection: "Dragon Ball Super" }, mockClient);
    assert.equal(updated.name_collection, "Dragon Ball Super");

    const disabled = await collectionRepository.updateStatus(1, false, mockClient);
    assert.equal(disabled.is_active, false);

    const maxPos = await collectionRepository.getMaxPosition(777, mockClient);
    assert.equal(maxPos, 5);

    const added = await collectionRepository.addProduct(777, 888, 1, mockClient);
    assert.equal(added.product_id, 888);

    const relation = await collectionRepository.findProductCollectionRelation(777, 888, mockClient);
    assert.equal(relation?.product_id, 888);

    const products = await collectionRepository.findCollectionProducts(777, mockClient);
    assert.equal(products.length, 1);

    await collectionRepository.updateProductPositions(777, [
      { product_id: 888, position_product_collection: 2 },
    ], mockClient);

    const removed = await collectionRepository.removeProduct(777, 888, mockClient);
    assert.equal(removed, true);

    const deleted = await collectionRepository.delete(1, mockClient);
    assert.equal(deleted, true);
  });
});
