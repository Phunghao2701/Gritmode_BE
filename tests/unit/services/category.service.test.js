import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCategoryTree,
  hasCategoryCycle,
  createCategoryService,
} from "../../../src/services/category.service.js";

describe("category service", () => {
  const transaction = async (fn) => fn({});

  test("buildCategoryTree builds hierarchical nested tree in memory", () => {
    const flatList = [
      { category_id: 1, name_category: "Clothing", parent_category_id: null, position_category: 1 },
      { category_id: 2, name_category: "Tops", parent_category_id: 1, position_category: 1 },
      { category_id: 3, name_category: "T-Shirts", parent_category_id: 2, position_category: 1 },
      { category_id: 4, name_category: "Bottoms", parent_category_id: 1, position_category: 2 },
    ];

    const tree = buildCategoryTree(flatList);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].name_category, "Clothing");
    assert.equal(tree[0].children.length, 2);
    assert.equal(tree[0].children[0].name_category, "Tops");
    assert.equal(tree[0].children[0].children.length, 1);
    assert.equal(tree[0].children[0].children[0].name_category, "T-Shirts");
  });

  test("hasCategoryCycle detects self-parent and circular descendants", () => {
    const allCategories = [
      { category_id: 1, parent_category_id: null },
      { category_id: 2, parent_category_id: 1 },
      { category_id: 3, parent_category_id: 2 },
      { category_id: 4, parent_category_id: null },
    ];

    // Self parent: 1 -> 1
    assert.equal(hasCategoryCycle(1, 1, allCategories), true);

    // Setting 1's parent to 3 (which is child of child of 1) creates a cycle
    assert.equal(hasCategoryCycle(1, 3, allCategories), true);

    // Setting 3's parent to 4 does not create cycle
    assert.equal(hasCategoryCycle(3, 4, allCategories), false);
  });

  test("getCategories returns tree of active categories", async () => {
    const service = createCategoryService({
      categories: {
        listActive: async () => [
          { category_id: 1, name_category: "Clothing", parent_category_id: null },
          { category_id: 2, name_category: "Tops", parent_category_id: 1 },
        ],
      },
      transaction,
    });

    const tree = await service.getCategories();
    assert.equal(tree.length, 1);
    assert.equal(tree[0].children.length, 1);
  });

  test("getCategoryById and getAdminCategories work properly", async () => {
    const service = createCategoryService({
      categories: {
        findById: async (id) => (id === 1 ? { category_id: 1, is_active: true } : id === 2 ? { category_id: 2, is_active: false } : null),
        listAll: async () => [
          { category_id: 1, name_category: "Clothing", parent_category_id: null },
          { category_id: 2, name_category: "Tops", parent_category_id: 1 },
        ],
      },
      transaction,
    });

    const activeCat = await service.getCategoryById(1);
    assert.equal(activeCat.category_id, 1);

    await assert.rejects(
      service.getCategoryById(2, false),
      (e) => e.code === "CATEGORY_NOT_FOUND" && e.statusCode === 404,
    );

    const adminCat = await service.getCategoryById(2, true);
    assert.equal(adminCat.category_id, 2);

    const flatList = await service.getAdminCategories({});
    assert.equal(flatList.length, 2);

    const treeList = await service.getAdminCategories({ tree: true });
    assert.equal(treeList.length, 1);
  });

  test("getProductsByCategory returns paginated products or 404", async () => {
    const service = createCategoryService({
      categories: {
        findById: async (id) => (id === 1 ? { category_id: 1, is_active: true } : null),
      },
      productListing: async () => ({ items: [{ product_id: 100 }], pagination: { page: 1, total: 1 } }),
      transaction,
    });

    await assert.rejects(
      service.getProductsByCategory(999),
      (e) => e.code === "CATEGORY_NOT_FOUND" && e.statusCode === 404,
    );

    const result = await service.getProductsByCategory(1);
    assert.equal(result.items.length, 1);
  });

  test("createCategory prevents duplicate slugs, checks parent and writes audit log", async () => {
    let createdAudit = false;
    const service = createCategoryService({
      categories: {
        findBySlug: async (slug) => (slug === "clothing" ? { category_id: 1 } : null),
        findById: async (id) => (id === 1 ? { category_id: 1 } : null),
        create: async (data) => ({ category_id: 2, ...data }),
      },
      audits: { record: async () => { createdAudit = true; } },
      transaction,
    });

    await assert.rejects(
      service.createCategory({ name_category: "Clothing", slug_category: "clothing" }, "admin-id"),
      (e) => e.code === "CATEGORY_SLUG_EXISTS" && e.statusCode === 409,
    );

    await assert.rejects(
      service.createCategory({ name_category: "Tops", parent_category_id: 999 }, "admin-id"),
      (e) => e.code === "PARENT_CATEGORY_NOT_FOUND" && e.statusCode === 404,
    );

    const created = await service.createCategory({ name_category: "Tops", parent_category_id: 1 }, "admin-id");
    assert.equal(created.name_category, "Tops");
    assert.equal(createdAudit, true);
  });

  test("updateCategory prevents self-parent, cycle, duplicate slugs", async () => {
    const mockCategories = [
      { category_id: 1, name_category: "Clothing", parent_category_id: null },
      { category_id: 2, name_category: "Tops", parent_category_id: 1 },
      { category_id: 3, name_category: "T-Shirts", parent_category_id: 2 },
    ];

    const service = createCategoryService({
      categories: {
        findById: async (id) => mockCategories.find((c) => c.category_id === id) || null,
        findBySlug: async (slug) => (slug === "taken" ? { category_id: 5 } : null),
        listAll: async () => mockCategories,
        update: async (id, data) => ({ category_id: id, ...data }),
      },
      audits: { record: async () => {} },
      transaction,
    });

    // Self parent rejected
    await assert.rejects(
      service.updateCategory(1, { parent_category_id: 1 }),
      (e) => e.code === "SELF_PARENT_CATEGORY" && e.statusCode === 400,
    );

    // Cycle rejected
    await assert.rejects(
      service.updateCategory(1, { parent_category_id: 3 }),
      (e) => e.code === "INVALID_CATEGORY_HIERARCHY" && e.statusCode === 400,
    );

    // Duplicate slug rejected
    await assert.rejects(
      service.updateCategory(1, { slug_category: "taken" }),
      (e) => e.code === "CATEGORY_SLUG_EXISTS" && e.statusCode === 409,
    );

    const updated = await service.updateCategory(2, { name_category: "Upper Tops" }, "admin-id");
    assert.equal(updated.name_category, "Upper Tops");
  });

  test("deleteCategory and updateCategoryStatus work properly", async () => {
    let deletedAudit = false;
    let statusAudit = false;

    const service = createCategoryService({
      categories: {
        findById: async (id) => (id === 1 ? { category_id: 1 } : null),
        updateStatus: async (id, status) => ({ category_id: id, is_active: status }),
      },
      audits: {
        record: async ({ action }) => {
          if (action === "disable_category") deletedAudit = true;
          if (action === "enable_category") statusAudit = true;
        },
      },
      transaction,
    });

    await assert.rejects(
      service.deleteCategory(999),
      (e) => e.code === "CATEGORY_NOT_FOUND" && e.statusCode === 404,
    );

    await service.deleteCategory(1, "admin-id");
    assert.equal(deletedAudit, true);

    const enabled = await service.updateCategoryStatus(1, true, "admin-id");
    assert.equal(enabled.is_active, true);
    assert.equal(statusAudit, true);
  });

  test("assign, remove, and set primary product categories (single & batch)", async () => {
    let assigned = false;
    let primarySet = false;
    let removed = false;

    const service = createCategoryService({
      products: { findById: async (id) => (id === 100 ? { product_id: 100 } : null) },
      categories: {
        findById: async (id) => (id === 1 ? { category_id: 1, is_active: true } : null),
        findProductCategoryRelation: async (prodId, catId) => (prodId === 100 && catId === 1 ? null : { product_id: prodId, category_id: catId }),
        assignProduct: async () => { assigned = true; return { product_id: 100, category_id: 1 }; },
        setPrimaryCategory: async () => { primarySet = true; },
        removeProduct: async () => { removed = true; return true; },
        findProductCategories: async () => [{ category_id: 1, is_primary: true }],
      },
      audits: { record: async () => {} },
      transaction,
    });

    await service.assignProductCategory(100, { category_id: 1, is_primary: true }, "admin-id");
    assert.equal(assigned, true);

    const batchService = createCategoryService({
      products: { findById: async (id) => (id === 100 ? { product_id: 100 } : null) },
      categories: {
        findById: async (id) => ({ category_id: id, is_active: true }),
        assignProduct: async () => ({ product_id: 100, category_id: 1 }),
        setPrimaryCategory: async () => {},
        findProductCategories: async () => [{ category_id: 1, is_primary: true }, { category_id: 2, is_primary: false }],
      },
      audits: { record: async () => {} },
      transaction,
    });

    const batchRes = await batchService.assignProductCategory(100, {
      categories: [
        { category_id: 1, is_primary: true },
        { category_id: 2, is_primary: false },
      ],
    }, "admin-id");
    assert.equal(batchRes.length, 2);

    const relationService = createCategoryService({
      products: { findById: async (id) => (id === 100 ? { product_id: 100 } : null) },
      categories: {
        findById: async (id) => ({ category_id: id, is_active: true }),
        findProductCategoryRelation: async () => ({ product_id: 100, category_id: 1 }),
        setPrimaryCategory: async () => { primarySet = true; },
        removeProduct: async () => { removed = true; return true; },
        findProductCategories: async () => [{ category_id: 1, is_primary: true }],
      },
      audits: { record: async () => {} },
      transaction,
    });

    await relationService.setPrimaryCategory(100, 1, "admin-id");
    assert.equal(primarySet, true);

    await relationService.removeProductCategory(100, 1, "admin-id");
    assert.equal(removed, true);
  });
});
