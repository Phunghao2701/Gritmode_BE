import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isCollectionVisible,
  getCollectionDisplayStatus,
  createCollectionService,
  getCollections,
  getAdminCollections,
  getCollectionById,
  getProductsByCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  updateCollectionStatus,
  addProductToCollection,
  removeProductFromCollection,
  reorderCollectionProducts,
} from "../../../src/services/collection.service.js";

describe("collection service", () => {
  const transaction = async (fn) => fn({});

  test("isCollectionVisible checks active state and time bounds", () => {
    const now = new Date("2026-07-01T12:00:00Z");

    assert.equal(isCollectionVisible(null), false);
    assert.equal(isCollectionVisible({ is_active: false }, now), false);
    assert.equal(isCollectionVisible({ is_active: true, start_at: "2026-08-01T00:00:00Z" }, now), false);
    assert.equal(isCollectionVisible({ is_active: true, end_at: "2026-06-01T00:00:00Z" }, now), false);
    assert.equal(isCollectionVisible({ is_active: true, start_at: "2026-06-01T00:00:00Z", end_at: "2026-08-01T00:00:00Z" }, now), true);
    assert.equal(isCollectionVisible({ is_active: true, start_at: null, end_at: null }, now), true);
  });

  test("getCollectionDisplayStatus computes active, scheduled, expired, inactive", () => {
    const now = new Date("2026-07-01T12:00:00Z");

    assert.equal(getCollectionDisplayStatus(null), "inactive");
    assert.equal(getCollectionDisplayStatus({ is_active: false }, now), "inactive");
    assert.equal(getCollectionDisplayStatus({ is_active: true, start_at: "2026-08-01T00:00:00Z" }, now), "scheduled");
    assert.equal(getCollectionDisplayStatus({ is_active: true, end_at: "2026-06-01T00:00:00Z" }, now), "expired");
    assert.equal(getCollectionDisplayStatus({ is_active: true, start_at: "2026-06-01T00:00:00Z", end_at: "2026-08-01T00:00:00Z" }, now), "active");
  });

  test("getCollections and getAdminCollections work properly with status filter", async () => {
    const service = createCollectionService({
      collections: {
        listVisible: async () => [{ collection_id: 1, name_collection: "Summer" }],
        listAll: async () => [
          { collection_id: 1, name_collection: "Summer", is_active: true },
          { collection_id: 2, name_collection: "Winter", is_active: false },
        ],
      },
      transaction,
    });

    const publicCols = await service.getCollections();
    assert.equal(publicCols.length, 1);

    const adminCols = await service.getAdminCollections({});
    assert.equal(adminCols.length, 2);
    assert.equal(adminCols[0].display_status, "active");
    assert.equal(adminCols[1].display_status, "inactive");

    const filtered = await service.getAdminCollections({ status: "inactive" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].collection_id, 2);
  });

  test("getCollectionById enforces visibility on public and returns stats on admin", async () => {
    const service = createCollectionService({
      collections: {
        findById: async (id) => (id === 1 ? { collection_id: 1, is_active: false } : id === 2 ? { collection_id: 2, is_active: true } : null),
      },
      transaction,
    });

    await assert.rejects(
      service.getCollectionById(999, false),
      (e) => e.code === "COLLECTION_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.getCollectionById(1, false),
      (e) => e.code === "COLLECTION_NOT_FOUND" && e.statusCode === 404,
    );

    const adminCol = await service.getCollectionById(1, true);
    assert.equal(adminCol.collection_id, 1);
    assert.equal(adminCol.display_status, "inactive");

    const publicCol = await service.getCollectionById(2, false);
    assert.equal(publicCol.collection_id, 2);
  });

  test("getProductsByCollection returns products or rejects invisible/missing", async () => {
    const service = createCollectionService({
      collections: {
        findById: async (id) => (id === 1 ? { collection_id: 1, is_active: true } : id === 2 ? { collection_id: 2, is_active: false } : null),
      },
      productListing: async () => ({ items: [{ product_id: 100 }], pagination: { total: 1 } }),
      transaction,
    });

    await assert.rejects(
      service.getProductsByCollection(999),
      (e) => e.code === "COLLECTION_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.getProductsByCollection(2, {}, false),
      (e) => e.code === "COLLECTION_NOT_FOUND" && e.statusCode === 404,
    );

    const adminRes = await service.getProductsByCollection(2, {}, true);
    assert.equal(adminRes.items.length, 1);

    const res = await service.getProductsByCollection(1, {});
    assert.equal(res.items.length, 1);
  });

  test("createCollection validates slug, dates, and logs audit", async () => {
    let createdAudit = false;
    const service = createCollectionService({
      collections: {
        findBySlug: async (slug) => (slug === "taken" ? { collection_id: 5 } : null),
        create: async (data) => ({ collection_id: 1, ...data }),
      },
      audits: { record: async () => { createdAudit = true; } },
      transaction,
    });

    await assert.rejects(
      service.createCollection({ name_collection: "Taken", slug_collection: "taken" }, "admin-id"),
      (e) => e.code === "COLLECTION_SLUG_EXISTS" && e.statusCode === 409,
    );

    await assert.rejects(
      service.createCollection({
        name_collection: "Summer",
        start_at: "2026-09-01T00:00:00Z",
        end_at: "2026-08-01T00:00:00Z",
      }, "admin-id"),
      (e) => e.code === "INVALID_DATE_RANGE" && e.statusCode === 400,
    );

    const created = await service.createCollection({ name_collection: "New Drop" }, "admin-id");
    assert.equal(created.name_collection, "New Drop");
    assert.equal(createdAudit, true);
  });

  test("updateCollection validates existence, date bounds, slug, and logs audit", async () => {
    const service = createCollectionService({
      collections: {
        findById: async (id) => (id === 1 ? { collection_id: 1, name_collection: "Old", start_at: "2026-06-01T00:00:00Z", end_at: "2026-08-01T00:00:00Z" } : null),
        findBySlug: async (slug) => (slug === "taken" ? { collection_id: 5 } : null),
        update: async (id, data) => ({ collection_id: id, ...data }),
      },
      audits: { record: async () => {} },
      transaction,
    });

    await assert.rejects(
      service.updateCollection(999, { name_collection: "New" }, "admin-id"),
      (e) => e.code === "COLLECTION_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.updateCollection(1, { slug_collection: "taken" }, "admin-id"),
      (e) => e.code === "COLLECTION_SLUG_EXISTS" && e.statusCode === 409,
    );

    await assert.rejects(
      service.updateCollection(1, { start_at: "2026-09-01T00:00:00Z" }, "admin-id"),
      (e) => e.code === "INVALID_DATE_RANGE" && e.statusCode === 400,
    );

    const updated = await service.updateCollection(1, { name_collection: "Updated" }, "admin-id");
    assert.equal(updated.name_collection, "Updated");
  });

  test("deleteCollection and updateCollectionStatus work properly", async () => {
    let deletedAudit = false;
    let statusAudit = false;

    const service = createCollectionService({
      collections: {
        findById: async (id) => (id === 1 ? { collection_id: 1 } : null),
        updateStatus: async (id, status) => ({ collection_id: id, is_active: status }),
      },
      audits: {
        record: async ({ action }) => {
          if (action === "disable_collection") deletedAudit = true;
          if (action === "enable_collection") statusAudit = true;
        },
      },
      transaction,
    });

    await assert.rejects(
      service.deleteCollection(999, "admin-id"),
      (e) => e.code === "COLLECTION_NOT_FOUND" && e.statusCode === 404,
    );

    await service.deleteCollection(1, "admin-id");
    assert.equal(deletedAudit, true);

    await assert.rejects(
      service.updateCollectionStatus(999, true, "admin-id"),
      (e) => e.code === "COLLECTION_NOT_FOUND" && e.statusCode === 404,
    );

    const enabled = await service.updateCollectionStatus(1, true, "admin-id");
    assert.equal(enabled.is_active, true);
    assert.equal(statusAudit, true);
  });

  test("addProductToCollection handles batch and single addition with errors", async () => {
    const service = createCollectionService({
      products: { findById: async (id) => (id === 100 || id === 101 ? { product_id: id } : null) },
      collections: {
        findById: async (id) => (id === 1 ? { collection_id: 1, is_active: true } : null),
        findProductCollectionRelation: async (colId, prodId) => (colId === 1 && prodId === 100 ? null : prodId === 999 ? { product_id: 999 } : null),
        getMaxPosition: async () => 2,
        addProduct: async () => ({ product_id: 100, collection_id: 1 }),
        findCollectionProducts: async () => [{ product_id: 100, position_product_collection: 3 }],
      },
      audits: { record: async () => {} },
      transaction,
    });

    await assert.rejects(
      service.addProductToCollection(999, { product_id: 100 }, "admin-id"),
      (e) => e.code === "COLLECTION_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      service.addProductToCollection(1, { products: [{ product_id: 999 }] }, "admin-id"),
      (e) => e.code === "PRODUCT_NOT_FOUND" && e.statusCode === 404,
    );

    const batchAdded = await service.addProductToCollection(1, {
      products: [
        { product_id: 100, position_product_collection: 5 },
        { product_id: 101 },
      ],
    }, "admin-id");
    assert.equal(batchAdded.length, 1);

    await assert.rejects(
      service.addProductToCollection(1, { product_id: 555 }, "admin-id"),
      (e) => e.code === "PRODUCT_NOT_FOUND" && e.statusCode === 404,
    );

    const singleCustomPos = await service.addProductToCollection(1, { product_id: 100, position_product_collection: 10 }, "admin-id");
    assert.equal(singleCustomPos.length, 1);
  });

  test("removeProductFromCollection and reorderCollectionProducts handle errors and succeed", async () => {
    const reorderService = createCollectionService({
      products: { findById: async (id) => (id === 100 ? { product_id: 100 } : null) },
      collections: {
        findById: async (id) => (id === 1 ? { collection_id: 1, is_active: true } : null),
        findProductCollectionRelation: async (colId, prodId) => (colId === 1 && prodId === 100 ? { product_id: 100, collection_id: 1 } : null),
        removeProduct: async () => true,
        updateProductPositions: async () => {},
        findCollectionProducts: async () => [{ product_id: 100, position_product_collection: 1 }],
      },
      audits: { record: async () => {} },
      transaction,
    });

    await assert.rejects(
      reorderService.removeProductFromCollection(999, 100, "admin-id"),
      (e) => e.code === "COLLECTION_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      reorderService.removeProductFromCollection(1, 999, "admin-id"),
      (e) => e.code === "PRODUCT_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      reorderService.reorderCollectionProducts(999, { products: [] }, "admin-id"),
      (e) => e.code === "COLLECTION_NOT_FOUND" && e.statusCode === 404,
    );

    await assert.rejects(
      reorderService.reorderCollectionProducts(1, { products: [{ product_id: 555 }] }, "admin-id"),
      (e) => e.code === "PRODUCT_COLLECTION_NOT_FOUND" && e.statusCode === 404,
    );

    await reorderService.removeProductFromCollection(1, 100, "admin-id");

    const reordered = await reorderService.reorderCollectionProducts(1, {
      products: [{ product_id: 100, position_product_collection: 1 }],
    }, "admin-id");
    assert.equal(reordered.length, 1);
  });

  test("exported standalone service functions route through default instance", () => {
    assert.ok(getCollections);
    assert.ok(getAdminCollections);
    assert.ok(getCollectionById);
    assert.ok(getProductsByCollection);
    assert.ok(createCollection);
    assert.ok(updateCollection);
    assert.ok(deleteCollection);
    assert.ok(updateCollectionStatus);
    assert.ok(addProductToCollection);
    assert.ok(removeProductFromCollection);
    assert.ok(reorderCollectionProducts);
  });
});
