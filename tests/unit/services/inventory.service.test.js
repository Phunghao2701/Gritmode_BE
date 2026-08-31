import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

// We test with injected mocks via factory
import { createInventoryService } from "../../../src/services/inventory.service.js";

const makeInventory = (overrides = {}) => ({
  inventory_id: 1,
  product_variant_id: 101,
  sku: "DC-TS-BLK-M",
  quantity_stock: 10,
  quantity_reserved: 2,
  quantity_available: 8,
  product_id: 1,
  name_product: "Logo T-Shirt",
  ...overrides,
});

describe("inventory service", () => {
  let inventories;
  let variants;
  let audits;
  let transaction;
  let service;

  beforeEach(() => {
    inventories = {
      findByVariantId: mock.fn(async () => makeInventory()),
      findAll: mock.fn(async () => [makeInventory()]),
      countAll: mock.fn(async () => 1),
      updateStock: mock.fn(async () => makeInventory({ quantity_stock: 25, quantity_available: 23 })),
      reserveStock: mock.fn(async () => makeInventory({ quantity_reserved: 5, quantity_available: 5 })),
      releaseReservedStock: mock.fn(async () => makeInventory({ quantity_reserved: 0, quantity_available: 10 })),
      commitReservedStock: mock.fn(async () => makeInventory({ quantity_stock: 8, quantity_reserved: 0, quantity_available: 8 })),
    };
    variants = {
      findById: mock.fn(async (id) => (id === 101 ? { product_variant_id: 101, sku: "DC-TS-BLK-M" } : null)),
    };
    audits = {
      record: mock.fn(async () => {}),
    };
    transaction = mock.fn(async (fn) => fn({}));

    service = createInventoryService({ inventories, variants, audits, transaction });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // ── getInventories ──────────────────────────────────────────────────────
  describe("getInventories", () => {
    test("returns paginated list with pagination meta", async () => {
      const result = await service.getInventories({ page: 1, limit: 20, sort: "updated_desc" });
      assert.ok(result.items);
      assert.ok(result.pagination);
      assert.equal(result.pagination.page, 1);
      assert.equal(result.pagination.limit, 20);
      assert.equal(result.pagination.total, 1);
      assert.equal(result.pagination.total_pages, 1);
    });

    test("calls findAll and countAll in parallel", async () => {
      await service.getInventories({ page: 1, limit: 20, sort: "updated_desc" });
      assert.equal(inventories.findAll.mock.calls.length, 1);
      assert.equal(inventories.countAll.mock.calls.length, 1);
    });

    test("computed LOW_STOCK_THRESHOLD flag on items", async () => {
      inventories.findAll = mock.fn(async () => [
        makeInventory({ quantity_available: 3 }),
        makeInventory({ inventory_id: 2, quantity_available: 10 }),
      ]);
      inventories.countAll = mock.fn(async () => 2);
      const result = await service.getInventories({ page: 1, limit: 20, sort: "updated_desc" });
      assert.equal(result.items[0].is_low_stock, true);
      assert.equal(result.items[1].is_low_stock, false);
    });

    test("is_out_of_stock flag on items", async () => {
      inventories.findAll = mock.fn(async () => [
        makeInventory({ quantity_available: 0 }),
      ]);
      inventories.countAll = mock.fn(async () => 1);
      const result = await service.getInventories({ page: 1, limit: 20, sort: "updated_desc" });
      assert.equal(result.items[0].is_out_of_stock, true);
    });
  });

  // ── getInventoryByVariantId ─────────────────────────────────────────────
  describe("getInventoryByVariantId", () => {
    test("returns inventory when variant and inventory exist", async () => {
      const result = await service.getInventoryByVariantId(101);
      assert.ok(result);
      assert.equal(result.product_variant_id, 101);
    });

    test("throws 404 when variant not found", async () => {
      variants.findById = mock.fn(async () => null);
      await assert.rejects(
        () => service.getInventoryByVariantId(999),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
    });

    test("throws 404 when inventory not found", async () => {
      inventories.findByVariantId = mock.fn(async () => null);
      await assert.rejects(
        () => service.getInventoryByVariantId(101),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
    });
  });

  // ── updateInventory ─────────────────────────────────────────────────────
  describe("updateInventory", () => {
    test("updates quantity_stock and records audit log", async () => {
      inventories.findByVariantId = mock.fn(async () => makeInventory({ quantity_reserved: 2 }));
      const result = await service.updateInventory(101, { quantity_stock: 25 }, "admin-uuid");
      assert.ok(result);
      assert.equal(audits.record.mock.calls.length, 1);
      const [auditCall] = audits.record.mock.calls;
      assert.equal(auditCall.arguments[0].action, "update_inventory");
    });

    test("throws 404 when variant not found", async () => {
      variants.findById = mock.fn(async () => null);
      await assert.rejects(
        () => service.updateInventory(999, { quantity_stock: 10 }, "admin"),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
    });

    test("throws 404 when inventory not found", async () => {
      inventories.findByVariantId = mock.fn(async () => null);
      await assert.rejects(
        () => service.updateInventory(101, { quantity_stock: 10 }, "admin"),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
    });

    test("throws 409 when new stock < current reserved", async () => {
      inventories.findByVariantId = mock.fn(async () => makeInventory({ quantity_reserved: 6 }));
      await assert.rejects(
        () => service.updateInventory(101, { quantity_stock: 4 }, "admin"),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.code, "STOCK_BELOW_RESERVED");
          return true;
        },
      );
    });

    test("allows setting stock exactly equal to reserved", async () => {
      inventories.findByVariantId = mock.fn(async () => makeInventory({ quantity_reserved: 5 }));
      inventories.updateStock = mock.fn(async () => makeInventory({ quantity_stock: 5, quantity_reserved: 5, quantity_available: 0 }));
      const result = await service.updateInventory(101, { quantity_stock: 5 }, "admin");
      assert.ok(result);
    });

    test("allows setting stock to 0 when reserved is 0", async () => {
      inventories.findByVariantId = mock.fn(async () => makeInventory({ quantity_reserved: 0, quantity_stock: 10 }));
      inventories.updateStock = mock.fn(async () => makeInventory({ quantity_stock: 0, quantity_reserved: 0, quantity_available: 0 }));
      const result = await service.updateInventory(101, { quantity_stock: 0 }, "admin");
      assert.ok(result);
    });
  });

  // ── checkAvailableStock ─────────────────────────────────────────────────
  describe("checkAvailableStock", () => {
    test("resolves when available >= requested", async () => {
      inventories.findByVariantId = mock.fn(async () => makeInventory({ quantity_stock: 10, quantity_reserved: 2, quantity_available: 8 }));
      const result = await service.checkAvailableStock(101, 5, {});
      assert.equal(result, true);
    });

    test("resolves when requested equals available exactly", async () => {
      inventories.findByVariantId = mock.fn(async () => makeInventory({ quantity_stock: 5, quantity_reserved: 0, quantity_available: 5 }));
      const result = await service.checkAvailableStock(101, 5, {});
      assert.equal(result, true);
    });

    test("throws 409 INSUFFICIENT_STOCK when available < requested", async () => {
      inventories.findByVariantId = mock.fn(async () => makeInventory({ quantity_stock: 5, quantity_reserved: 3, quantity_available: 2 }));
      await assert.rejects(
        () => service.checkAvailableStock(101, 5, {}),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.code, "INSUFFICIENT_STOCK");
          return true;
        },
      );
    });

    test("throws 404 when inventory not found", async () => {
      inventories.findByVariantId = mock.fn(async () => null);
      await assert.rejects(
        () => service.checkAvailableStock(999, 1, {}),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
    });
  });

  // ── reserveStock ────────────────────────────────────────────────────────
  describe("reserveStock", () => {
    test("reserves stock atomically and returns updated row", async () => {
      const result = await service.reserveStock(101, 3, {});
      assert.ok(result);
      assert.equal(inventories.reserveStock.mock.calls.length, 1);
    });

    test("throws 409 INSUFFICIENT_STOCK when atomic update returns null", async () => {
      inventories.reserveStock = mock.fn(async () => null);
      await assert.rejects(
        () => service.reserveStock(101, 100, {}),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.code, "INSUFFICIENT_STOCK");
          return true;
        },
      );
    });
  });

  // ── releaseReservedStock ────────────────────────────────────────────────
  describe("releaseReservedStock", () => {
    test("releases reserved stock", async () => {
      const result = await service.releaseReservedStock(101, 2, {});
      assert.ok(result);
    });

    test("throws 404 when inventory not found", async () => {
      inventories.releaseReservedStock = mock.fn(async () => null);
      await assert.rejects(
        () => service.releaseReservedStock(101, 2, {}),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
    });
  });

  // ── commitReservedStock ─────────────────────────────────────────────────
  describe("commitReservedStock", () => {
    test("commits reserved stock (deducts stock + reserved)", async () => {
      const result = await service.commitReservedStock(101, 2, {});
      assert.ok(result);
    });

    test("throws 404 when inventory not found or insufficient reserved", async () => {
      inventories.commitReservedStock = mock.fn(async () => null);
      await assert.rejects(
        () => service.commitReservedStock(101, 999, {}),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
    });
  });
});
