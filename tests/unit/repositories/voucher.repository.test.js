import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { voucherRepository } from "../../../src/repositories/voucher.repository.js";

describe("voucher repository", () => {
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

  // ── findByCode ───────────────────────────────────────────────────────────
  describe("findByCode", () => {
    test("returns voucher by code", async () => {
      const voucher = {
        voucher_id: 1,
        code_voucher: "SUMMER10",
        name_voucher: "Summer 10%",
        discount_type: "percentage",
        discount_value: 10,
      };
      mockClient.query = mock.fn(async () => ({ rows: [voucher], rowCount: 1 }));
      const result = await voucherRepository.findByCode("SUMMER10", mockClient);
      assert.ok(result);
      assert.equal(result.code_voucher, "SUMMER10");
    });

    test("returns null when not found", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await voucherRepository.findByCode("NONEXISTENT", mockClient);
      assert.equal(result, null);
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────
  describe("findById", () => {
    test("returns voucher by id", async () => {
      const voucher = {
        voucher_id: 1,
        code_voucher: "SUMMER10",
      };
      mockClient.query = mock.fn(async () => ({ rows: [voucher], rowCount: 1 }));
      const result = await voucherRepository.findById(1, mockClient);
      assert.ok(result);
      assert.equal(result.voucher_id, 1);
    });

    test("returns null when not found", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await voucherRepository.findById(999, mockClient);
      assert.equal(result, null);
    });
  });

  // ── findAll & countAll ───────────────────────────────────────────────────
  describe("findAll & countAll", () => {
    test("returns paginated list and count with search & filters", async () => {
      const rows = [
        { voucher_id: 1, code_voucher: "SUMMER10" },
        { voucher_id: 2, code_voucher: "SUMMER20" },
      ];
      mockClient.query = mock.fn(async (q) => {
        if (typeof q === "string" && q.includes("COUNT(")) {
          return { rows: [{ count: "2" }], rowCount: 1 };
        }
        return { rows, rowCount: 2 };
      });

      const items = await voucherRepository.findAll(
        { page: 1, limit: 20, search: "summer", discount_type: "percentage", status: "active", sort: "code_asc" },
        mockClient,
      );
      const count = await voucherRepository.countAll(
        { search: "summer", discount_type: "percentage", status: "active" },
        mockClient,
      );

      assert.equal(items.length, 2);
      assert.equal(count, 2);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────
  describe("create", () => {
    test("inserts new voucher and returns row", async () => {
      const payload = {
        code_voucher: "SALE50K",
        name_voucher: "Sale 50K",
        discount_type: "fixed_amount",
        discount_value: 50000,
        minimum_order_amount: 300000,
        maximum_discount_amount: null,
        usage_limit: 100,
        start_at: null,
        end_at: null,
        is_active: true,
      };
      mockClient.query = mock.fn(async () => ({
        rows: [{ voucher_id: 10, ...payload, usage_count: 0 }],
        rowCount: 1,
      }));
      const created = await voucherRepository.create(payload, mockClient);
      assert.ok(created);
      assert.equal(created.voucher_id, 10);
      assert.equal(created.code_voucher, "SALE50K");
    });
  });

  // ── update ───────────────────────────────────────────────────────────────
  describe("update", () => {
    test("updates voucher fields and returns updated row", async () => {
      mockClient.query = mock.fn(async () => ({
        rows: [{ voucher_id: 10, name_voucher: "Updated Name" }],
        rowCount: 1,
      }));
      const updated = await voucherRepository.update(10, { name_voucher: "Updated Name" }, mockClient);
      assert.ok(updated);
      assert.equal(updated.name_voucher, "Updated Name");
    });

    test("returns null if nothing updated", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      const updated = await voucherRepository.update(999, { name_voucher: "None" }, mockClient);
      assert.equal(updated, null);
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────
  describe("updateStatus", () => {
    test("updates is_active boolean", async () => {
      mockClient.query = mock.fn(async () => ({
        rows: [{ voucher_id: 10, is_active: false }],
        rowCount: 1,
      }));
      const updated = await voucherRepository.updateStatus(10, false, mockClient);
      assert.ok(updated);
      assert.equal(updated.is_active, false);
    });
  });

  // ── delete ───────────────────────────────────────────────────────────────
  describe("delete", () => {
    test("deletes voucher by id", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 1 }));
      const result = await voucherRepository.delete(10, mockClient);
      assert.equal(result, true);
    });
  });

  // ── hasOrderReferences ───────────────────────────────────────────────────
  describe("hasOrderReferences", () => {
    test("returns true if orders reference voucher", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ count: "3" }], rowCount: 1 }));
      const result = await voucherRepository.hasOrderReferences(10, mockClient);
      assert.equal(result, true);
    });

    test("returns false if no orders reference voucher", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ count: "0" }], rowCount: 1 }));
      const result = await voucherRepository.hasOrderReferences(10, mockClient);
      assert.equal(result, false);
    });
  });

  // ── incrementUsage ───────────────────────────────────────────────────────
  describe("incrementUsage", () => {
    test("atomically increments usage_count when limit not exceeded", async () => {
      mockClient.query = mock.fn(async () => ({
        rows: [{ voucher_id: 1, usage_count: 5, usage_limit: 10 }],
        rowCount: 1,
      }));
      const result = await voucherRepository.incrementUsage(1, mockClient);
      assert.ok(result);
      assert.equal(result.usage_count, 5);
    });

    test("returns null if usage limit reached (0 rows updated)", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await voucherRepository.incrementUsage(1, mockClient);
      assert.equal(result, null);
    });
  });
});
