import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { categoryRepository } from "../../../src/repositories/category.repository.js";

describe("category repository", () => {
  test("category repository handles CRUD, lookups and product associations", async () => {
    const sampleCategory = {
      category_id: 1,
      name_category: "Clothing",
      slug_category: "clothing",
      parent_category_id: null,
      description_category: "All clothing",
      position_category: 1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockClient = {
      query: async (sql, params) => {
        const sqlStr = String(sql);
        if (sqlStr.includes("DELETE") || sqlStr.includes("UPDATE product_category")) {
          return { rowCount: 1, rows: [] };
        }
        if (sqlStr.includes("JOIN category c ON")) {
          return { rows: [{ category_id: 1, name_category: "Clothing", is_primary: true }] };
        }
        if (sqlStr.includes("product_category") && !sqlStr.includes("FROM category c")) {
          return { rows: [{ product_id: 555, category_id: 777, is_primary: Boolean(params?.[2] ?? true) }] };
        }
        if (sqlStr.includes("is_active = $1")) {
          return { rows: [{ ...sampleCategory, is_active: Boolean(params?.[0]) }] };
        }
        if (sqlStr.includes("UPDATE category")) {
          return { rows: [{ ...sampleCategory, name_category: "Apparel" }] };
        }
        if (sqlStr.includes("INSERT INTO category")) {
          return { rows: [sampleCategory] };
        }
        return { rows: [sampleCategory] };
      },
    };

    const activeList = await categoryRepository.listActive(mockClient);
    assert.equal(activeList.length, 1);
    assert.equal(activeList[0].slug_category, "clothing");

    const allList = await categoryRepository.listAll({}, mockClient);
    assert.equal(allList.length, 1);

    const foundById = await categoryRepository.findById(1, mockClient);
    assert.equal(foundById.category_id, 1);

    const foundBySlug = await categoryRepository.findBySlug("clothing", mockClient);
    assert.equal(foundBySlug.slug_category, "clothing");

    const created = await categoryRepository.create({
      name_category: "Clothing",
      slug_category: "clothing",
    }, mockClient);
    assert.equal(created.name_category, "Clothing");

    const updated = await categoryRepository.update(1, { name_category: "Apparel" }, mockClient);
    assert.equal(updated.name_category, "Apparel");

    const disabled = await categoryRepository.updateStatus(1, false, mockClient);
    assert.equal(disabled.is_active, false);

    const assigned = await categoryRepository.assignProduct(555, 777, true, mockClient);
    assert.equal(assigned.is_primary, true);

    const relation = await categoryRepository.findProductCategoryRelation(555, 777, mockClient);
    assert.equal(relation?.product_id, 555);

    const productCats = await categoryRepository.findProductCategories(555, mockClient);
    assert.equal(productCats.length, 1);

    await categoryRepository.setPrimaryCategory(555, 777, mockClient);

    const removed = await categoryRepository.removeProduct(555, 777, mockClient);
    assert.equal(removed, true);

    const deleted = await categoryRepository.delete(1, mockClient);
    assert.equal(deleted, true);
  });
});
