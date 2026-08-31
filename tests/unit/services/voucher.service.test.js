import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  createVoucherService,
  calculateVoucherDiscount,
  getVoucherRuntimeStatus,
} from "../../../src/services/voucher.service.js";

const makeVoucher = (overrides = {}) => ({
  voucher_id: 1,
  code_voucher: "SUMMER10",
  name_voucher: "Summer 10%",
  discount_type: "percentage",
  discount_value: 10,
  minimum_order_amount: 500000,
  maximum_discount_amount: 100000,
  usage_limit: 100,
  usage_count: 5,
  start_at: null,
  end_at: null,
  is_active: true,
  ...overrides,
});

describe("voucher service", () => {
  let vouchers;
  let carts;
  let audits;
  let transaction;
  let service;

  beforeEach(() => {
    vouchers = {
      findByCode: mock.fn(async (code) => (code === "SUMMER10" ? makeVoucher() : null)),
      findById: mock.fn(async (id) => (id === 1 ? makeVoucher() : null)),
      findAll: mock.fn(async () => [makeVoucher()]),
      countAll: mock.fn(async () => 1),
      create: mock.fn(async (data) => ({ voucher_id: 2, ...data, usage_count: 0 })),
      update: mock.fn(async (id, data) => ({ ...makeVoucher({ voucher_id: id }), ...data })),
      updateStatus: mock.fn(async (id, isActive) => makeVoucher({ voucher_id: id, is_active: isActive })),
      delete: mock.fn(async () => true),
      hasOrderReferences: mock.fn(async () => false),
      incrementUsage: mock.fn(async (id) => makeVoucher({ voucher_id: id, usage_count: 6 })),
    };
    carts = {
      getCart: mock.fn(async () => ({
        cart_id: 10,
        items: [{ cart_item_id: 1, quantity: 2, price: 500000, total_item: 1000000 }],
        summary: { total_items: 2, subtotal: 1000000 },
      })),
    };
    audits = {
      record: mock.fn(async () => {}),
    };
    transaction = mock.fn(async (fn) => fn({}));

    service = createVoucherService({ vouchers, carts, audits, transaction });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // ── calculateVoucherDiscount ─────────────────────────────────────────────
  describe("calculateVoucherDiscount", () => {
    test("calculates percentage discount without maximum limit", () => {
      const voucher = { discount_type: "percentage", discount_value: 15, maximum_discount_amount: null };
      const discount = calculateVoucherDiscount(voucher, 1000000);
      assert.equal(discount, 150000);
    });

    test("caps percentage discount at maximum_discount_amount", () => {
      const voucher = { discount_type: "percentage", discount_value: 20, maximum_discount_amount: 100000 };
      const discount = calculateVoucherDiscount(voucher, 1000000);
      assert.equal(discount, 100000);
    });

    test("calculates fixed_amount discount", () => {
      const voucher = { discount_type: "fixed_amount", discount_value: 50000 };
      const discount = calculateVoucherDiscount(voucher, 500000);
      assert.equal(discount, 50000);
    });

    test("fixed_amount discount cannot exceed subtotal", () => {
      const voucher = { discount_type: "fixed_amount", discount_value: 100000 };
      const discount = calculateVoucherDiscount(voucher, 40000);
      assert.equal(discount, 40000);
    });
  });

  // ── getVoucherRuntimeStatus ──────────────────────────────────────────────
  describe("getVoucherRuntimeStatus", () => {
    const now = new Date("2026-09-15T12:00:00Z");

    test("returns inactive when is_active is false", () => {
      assert.equal(getVoucherRuntimeStatus({ is_active: false }, now), "inactive");
    });

    test("returns scheduled when start_at > now", () => {
      assert.equal(
        getVoucherRuntimeStatus({ is_active: true, start_at: "2026-09-20T00:00:00Z" }, now),
        "scheduled",
      );
    });

    test("returns expired when end_at < now", () => {
      assert.equal(
        getVoucherRuntimeStatus({ is_active: true, end_at: "2026-09-10T00:00:00Z" }, now),
        "expired",
      );
    });

    test("returns exhausted when usage_count >= usage_limit", () => {
      assert.equal(
        getVoucherRuntimeStatus({ is_active: true, usage_limit: 10, usage_count: 10 }, now),
        "exhausted",
      );
    });

    test("returns active when all conditions pass", () => {
      assert.equal(
        getVoucherRuntimeStatus(
          { is_active: true, start_at: "2026-09-01T00:00:00Z", end_at: "2026-09-30T00:00:00Z", usage_limit: 100, usage_count: 5 },
          now,
        ),
        "active",
      );
    });
  });

  // ── validateVoucher ──────────────────────────────────────────────────────
  describe("validateVoucher", () => {
    test("successfully validates voucher for active cart", async () => {
      const res = await service.validateVoucher({ type: "guest", guestToken: "token" }, "SUMMER10");
      assert.ok(res);
      assert.equal(res.code_voucher, "SUMMER10");
      assert.equal(res.subtotal, 1000000);
      assert.equal(res.discount_amount, 100000);
      assert.equal(res.total_after_discount, 900000);
    });

    test("throws 400 CART_EMPTY when cart has no items", async () => {
      carts.getCart = mock.fn(async () => ({ items: [], summary: { total_items: 0, subtotal: 0 } }));
      await assert.rejects(
        () => service.validateVoucher({ type: "user", userId: "u1" }, "SUMMER10"),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, "CART_EMPTY");
          return true;
        },
      );
    });

    test("throws 404 VOUCHER_NOT_FOUND when voucher does not exist", async () => {
      vouchers.findByCode = mock.fn(async () => null);
      await assert.rejects(
        () => service.validateVoucher({ type: "user", userId: "u1" }, "UNKNOWN"),
        (err) => {
          assert.equal(err.statusCode, 404);
          assert.equal(err.code, "VOUCHER_NOT_FOUND");
          return true;
        },
      );
    });

    test("throws 400 VOUCHER_INACTIVE when voucher is not active", async () => {
      vouchers.findByCode = mock.fn(async () => makeVoucher({ is_active: false }));
      await assert.rejects(
        () => service.validateVoucher({ type: "user", userId: "u1" }, "SUMMER10"),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, "VOUCHER_INACTIVE");
          return true;
        },
      );
    });

    test("throws 400 VOUCHER_NOT_STARTED when start_at is in the future", async () => {
      vouchers.findByCode = mock.fn(async () => makeVoucher({ start_at: new Date(Date.now() + 86400000).toISOString() }));
      await assert.rejects(
        () => service.validateVoucher({ type: "user", userId: "u1" }, "SUMMER10"),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, "VOUCHER_NOT_STARTED");
          return true;
        },
      );
    });

    test("throws 400 VOUCHER_EXPIRED when end_at is in the past", async () => {
      vouchers.findByCode = mock.fn(async () => makeVoucher({ end_at: new Date(Date.now() - 86400000).toISOString() }));
      await assert.rejects(
        () => service.validateVoucher({ type: "user", userId: "u1" }, "SUMMER10"),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, "VOUCHER_EXPIRED");
          return true;
        },
      );
    });

    test("throws 409 VOUCHER_EXHAUSTED when usage_count >= usage_limit", async () => {
      vouchers.findByCode = mock.fn(async () => makeVoucher({ usage_limit: 10, usage_count: 10 }));
      await assert.rejects(
        () => service.validateVoucher({ type: "user", userId: "u1" }, "SUMMER10"),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.code, "VOUCHER_EXHAUSTED");
          return true;
        },
      );
    });

    test("throws 400 MINIMUM_ORDER_NOT_MET when subtotal < minimum_order_amount", async () => {
      carts.getCart = mock.fn(async () => ({
        items: [{ cart_item_id: 1, quantity: 1, price: 300000, total_item: 300000 }],
        summary: { total_items: 1, subtotal: 300000 },
      }));
      await assert.rejects(
        () => service.validateVoucher({ type: "user", userId: "u1" }, "SUMMER10"),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, "MINIMUM_ORDER_NOT_MET");
          assert.equal(err.data.minimum_order_amount, 500000);
          assert.equal(err.data.current_subtotal, 300000);
          return true;
        },
      );
    });
  });

  // ── Admin Operations ─────────────────────────────────────────────────────
  describe("Admin operations", () => {
    test("getVouchers returns paginated list with computed status", async () => {
      const res = await service.getVouchers({ page: 1, limit: 20 });
      assert.ok(res.items);
      assert.equal(res.items[0].status_voucher, "active");
      assert.equal(res.items[0].remaining_usage, 95);
      assert.equal(res.pagination.total, 1);
    });

    test("getVoucherById returns detail with computed status", async () => {
      const res = await service.getVoucherById(1);
      assert.ok(res);
      assert.equal(res.voucher_id, 1);
      assert.equal(res.status_voucher, "active");
    });

    test("getVoucherById throws 404 when not found", async () => {
      vouchers.findById = mock.fn(async () => null);
      await assert.rejects(
        () => service.getVoucherById(999),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        },
      );
    });

    test("createVoucher validates uniqueness, inserts and records audit log", async () => {
      vouchers.findByCode = mock.fn(async () => null);
      const data = {
        code_voucher: "NEWCODE",
        name_voucher: "New Voucher",
        discount_type: "percentage",
        discount_value: 10,
      };
      const created = await service.createVoucher(data, "admin-id");
      assert.ok(created);
      assert.equal(audits.record.mock.calls.length, 1);
      assert.equal(audits.record.mock.calls[0].arguments[0].action, "create_voucher");
    });

    test("createVoucher throws 409 when code already exists", async () => {
      vouchers.findByCode = mock.fn(async () => makeVoucher());
      await assert.rejects(
        () => service.createVoucher({ code_voucher: "SUMMER10" }, "admin-id"),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.code, "VOUCHER_CODE_EXISTS");
          return true;
        },
      );
    });

    test("updateVoucher validates merged date bounds and usage limit", async () => {
      vouchers.findById = mock.fn(async () => makeVoucher({ usage_count: 50 }));
      await assert.rejects(
        () => service.updateVoucher(1, { usage_limit: 20 }, "admin-id"),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, "INVALID_USAGE_LIMIT");
          return true;
        },
      );
    });

    test("updateVoucher updates and logs audit", async () => {
      const updated = await service.updateVoucher(1, { name_voucher: "Updated Summer" }, "admin-id");
      assert.ok(updated);
      assert.equal(audits.record.mock.calls.length, 1);
      assert.equal(audits.record.mock.calls[0].arguments[0].action, "update_voucher");
    });

    test("updateVoucherStatus toggles active state and logs audit", async () => {
      const res = await service.updateVoucherStatus(1, false, "admin-id");
      assert.equal(res.is_active, false);
      assert.equal(audits.record.mock.calls.length, 1);
    });

    test("deleteVoucher rejects deletion when voucher is referenced in orders", async () => {
      vouchers.hasOrderReferences = mock.fn(async () => true);
      await assert.rejects(
        () => service.deleteVoucher(1, "admin-id"),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.code, "VOUCHER_IN_USE");
          return true;
        },
      );
    });

    test("deleteVoucher deletes unreferenced voucher and logs audit", async () => {
      vouchers.hasOrderReferences = mock.fn(async () => false);
      await service.deleteVoucher(1, "admin-id");
      assert.equal(vouchers.delete.mock.calls.length, 1);
      assert.equal(audits.record.mock.calls.length, 1);
    });
  });

  // ── incrementVoucherUsage ────────────────────────────────────────────────
  describe("incrementVoucherUsage", () => {
    test("increments usage count successfully", async () => {
      const res = await service.incrementVoucherUsage(1, {});
      assert.ok(res);
      assert.equal(res.usage_count, 6);
    });

    test("throws 409 VOUCHER_EXHAUSTED when atomic increment fails", async () => {
      vouchers.incrementUsage = mock.fn(async () => null);
      await assert.rejects(
        () => service.incrementVoucherUsage(1, {}),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.code, "VOUCHER_EXHAUSTED");
          return true;
        },
      );
    });
  });
});
