import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateInventoryQuery,
  validateUpdateInventory,
} from "../../../src/utils/validation.js";

describe("inventory validation primitives", () => {
  // ── validateInventoryQuery ──────────────────────────────────────────────
  describe("validateInventoryQuery", () => {
    test("returns defaults for empty input", () => {
      const result = validateInventoryQuery({});
      assert.ok(result.ok);
      assert.equal(result.value.page, 1);
      assert.equal(result.value.limit, 20);
      assert.equal(result.value.search, undefined);
      assert.equal(result.value.low_stock, false);
      assert.equal(result.value.out_of_stock, false);
      assert.equal(result.value.sort, "updated_desc");
    });

    test("accepts valid page, limit, search", () => {
      const result = validateInventoryQuery({ page: "2", limit: "50", search: "Logo" });
      assert.ok(result.ok);
      assert.equal(result.value.page, 2);
      assert.equal(result.value.limit, 50);
      assert.equal(result.value.search, "Logo");
    });

    test("accepts low_stock and out_of_stock as true", () => {
      const result = validateInventoryQuery({ low_stock: "true", out_of_stock: "true" });
      assert.ok(result.ok);
      assert.equal(result.value.low_stock, true);
      assert.equal(result.value.out_of_stock, true);
    });

    test("accepts low_stock and out_of_stock as false", () => {
      const result = validateInventoryQuery({ low_stock: "false", out_of_stock: "false" });
      assert.ok(result.ok);
      assert.equal(result.value.low_stock, false);
      assert.equal(result.value.out_of_stock, false);
    });

    test("accepts all valid sort values", () => {
      const sortValues = ["stock_asc", "stock_desc", "available_asc", "available_desc", "sku_asc", "sku_desc", "updated_desc"];
      for (const sort of sortValues) {
        const result = validateInventoryQuery({ sort });
        assert.ok(result.ok, `sort=${sort} should be valid`);
        assert.equal(result.value.sort, sort);
      }
    });

    test("rejects invalid sort value", () => {
      const result = validateInventoryQuery({ sort: "invalid_sort" });
      assert.ok(!result.ok);
      assert.ok(result.errors.some((e) => e.field === "sort"));
    });

    test("rejects page < 1", () => {
      const result = validateInventoryQuery({ page: "0" });
      assert.ok(!result.ok);
      assert.ok(result.errors.some((e) => e.field === "page"));
    });

    test("rejects limit > 100", () => {
      const result = validateInventoryQuery({ limit: "101" });
      assert.ok(!result.ok);
      assert.ok(result.errors.some((e) => e.field === "limit"));
    });

    test("rejects non-string page", () => {
      const result = validateInventoryQuery({ page: "abc" });
      assert.ok(!result.ok);
    });

    test("handles null input", () => {
      const result = validateInventoryQuery(null);
      assert.ok(!result.ok);
    });
  });

  // ── validateUpdateInventory ─────────────────────────────────────────────
  describe("validateUpdateInventory", () => {
    test("accepts valid quantity_stock = 0", () => {
      const result = validateUpdateInventory({ quantity_stock: 0 });
      assert.ok(result.ok);
      assert.equal(result.value.quantity_stock, 0);
    });

    test("accepts valid quantity_stock positive integer", () => {
      const result = validateUpdateInventory({ quantity_stock: 25 });
      assert.ok(result.ok);
      assert.equal(result.value.quantity_stock, 25);
    });

    test("rejects negative quantity_stock", () => {
      const result = validateUpdateInventory({ quantity_stock: -1 });
      assert.ok(!result.ok);
      assert.ok(result.errors.some((e) => e.field === "quantity_stock"));
    });

    test("rejects float quantity_stock", () => {
      const result = validateUpdateInventory({ quantity_stock: 1.5 });
      assert.ok(!result.ok);
      assert.ok(result.errors.some((e) => e.field === "quantity_stock"));
    });

    test("rejects string quantity_stock", () => {
      const result = validateUpdateInventory({ quantity_stock: "twenty" });
      assert.ok(!result.ok);
    });

    test("rejects missing quantity_stock", () => {
      const result = validateUpdateInventory({});
      assert.ok(!result.ok);
      assert.ok(result.errors.some((e) => e.field === "quantity_stock"));
    });

    test("rejects quantity_reserved in body", () => {
      const result = validateUpdateInventory({ quantity_stock: 10, quantity_reserved: 5 });
      assert.ok(!result.ok);
      assert.ok(result.errors.some((e) => e.field === "quantity_reserved"));
    });

    test("rejects other forbidden fields", () => {
      const result = validateUpdateInventory({ quantity_stock: 10, inventory_id: 1 });
      assert.ok(!result.ok);
      assert.ok(result.errors.some((e) => e.field === "inventory_id"));
    });

    test("handles null input", () => {
      const result = validateUpdateInventory(null);
      assert.ok(!result.ok);
    });
  });
});
