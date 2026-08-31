import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";

// Import the repository under test
import { inventoryRepository } from "../../../src/repositories/inventory.repository.js";

describe("inventory repository", () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: mock.fn(async () => ({ rows: [], rowCount: 0 })),
      release: mock.fn(),
    };
    mock.method(pool, "connect", async () => mockClient);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // ── findByVariantId ────────────────────────────────────────────────────
  describe("findByVariantId", () => {
    test("returns inventory row with computed quantity_available", async () => {
      const row = {
        inventory_id: 1,
        product_variant_id: 101,
        sku: "DC-TS-BLK-M",
        quantity_stock: 10,
        quantity_reserved: 2,
        quantity_available: 8,
        product_id: 1,
        name_product: "Logo T-Shirt",
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockClient.query = mock.fn(async () => ({ rows: [row], rowCount: 1 }));
      const result = await inventoryRepository.findByVariantId(101, mockClient);
      assert.ok(result);
      assert.equal(result.inventory_id, 1);
      assert.equal(result.quantity_available, 8);
    });

    test("returns null when not found", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await inventoryRepository.findByVariantId(999, mockClient);
      assert.equal(result, null);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────
  describe("findAll", () => {
    test("returns paginated list of inventories", async () => {
      const rows = [
        { inventory_id: 1, product_variant_id: 101, sku: "SKU-A", quantity_stock: 10, quantity_reserved: 2, quantity_available: 8 },
        { inventory_id: 2, product_variant_id: 102, sku: "SKU-B", quantity_stock: 5, quantity_reserved: 5, quantity_available: 0 },
      ];
      mockClient.query = mock.fn(async () => ({ rows, rowCount: rows.length }));
      const result = await inventoryRepository.findAll({ page: 1, limit: 20, sort: "updated_desc" }, mockClient);
      assert.equal(result.length, 2);
      assert.equal(result[0].sku, "SKU-A");
    });

    test("accepts search filter", async () => {
      mockClient.query = mock.fn(async ({ text, values } = {}) => ({ rows: [], rowCount: 0 }));
      await inventoryRepository.findAll({ page: 1, limit: 20, search: "Logo", sort: "updated_desc" }, mockClient);
      // Just ensure no error thrown
      assert.ok(true);
    });

    test("accepts low_stock filter", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      await inventoryRepository.findAll({ page: 1, limit: 20, low_stock: true, sort: "updated_desc" }, mockClient);
      assert.ok(true);
    });

    test("accepts out_of_stock filter", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      await inventoryRepository.findAll({ page: 1, limit: 20, out_of_stock: true, sort: "updated_desc" }, mockClient);
      assert.ok(true);
    });
  });

  // ── countAll ───────────────────────────────────────────────────────────
  describe("countAll", () => {
    test("returns total count", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ count: "42" }], rowCount: 1 }));
      const count = await inventoryRepository.countAll({ sort: "updated_desc" }, mockClient);
      assert.equal(count, 42);
    });

    test("returns 0 when no rows", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ count: "0" }], rowCount: 1 }));
      const count = await inventoryRepository.countAll({}, mockClient);
      assert.equal(count, 0);
    });
  });

  // ── updateStock ────────────────────────────────────────────────────────
  describe("updateStock", () => {
    test("updates quantity_stock and returns updated row", async () => {
      const row = { inventory_id: 1, product_variant_id: 101, quantity_stock: 25, quantity_reserved: 2 };
      mockClient.query = mock.fn(async () => ({ rows: [row], rowCount: 1 }));
      const result = await inventoryRepository.updateStock(101, 25, mockClient);
      assert.ok(result);
      assert.equal(result.quantity_stock, 25);
    });

    test("returns null when variant not found", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await inventoryRepository.updateStock(999, 10, mockClient);
      assert.equal(result, null);
    });
  });

  // ── reserveStock ───────────────────────────────────────────────────────
  describe("reserveStock", () => {
    test("atomically increments reserved when stock sufficient", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ quantity_reserved: 5 }], rowCount: 1 }));
      const result = await inventoryRepository.reserveStock(101, 3, mockClient);
      assert.ok(result);
    });

    test("returns null when insufficient stock (0 rows affected)", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await inventoryRepository.reserveStock(101, 100, mockClient);
      assert.equal(result, null);
    });
  });

  // ── releaseReservedStock ───────────────────────────────────────────────
  describe("releaseReservedStock", () => {
    test("decrements reserved by qty", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ quantity_reserved: 2 }], rowCount: 1 }));
      const result = await inventoryRepository.releaseReservedStock(101, 3, mockClient);
      assert.ok(result);
    });

    test("returns null when not found", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await inventoryRepository.releaseReservedStock(999, 1, mockClient);
      assert.equal(result, null);
    });
  });

  // ── commitReservedStock ────────────────────────────────────────────────
  describe("commitReservedStock", () => {
    test("decrements both stock and reserved by qty", async () => {
      mockClient.query = mock.fn(async () => ({
        rows: [{ quantity_stock: 8, quantity_reserved: 2 }],
        rowCount: 1,
      }));
      const result = await inventoryRepository.commitReservedStock(101, 2, mockClient);
      assert.ok(result);
      assert.equal(result.quantity_stock, 8);
    });

    test("returns null when not found or insufficient", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await inventoryRepository.commitReservedStock(999, 10, mockClient);
      assert.equal(result, null);
    });
  });
});
