import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateVoucherApplication,
  validateCreateVoucher,
  validateUpdateVoucher,
  validateUpdateVoucherStatus,
  validateVoucherQuery,
} from "../../../src/utils/validation.js";

describe("voucher validation primitives", () => {
  // ── validateVoucherApplication ───────────────────────────────────────────
  describe("validateVoucherApplication", () => {
    test("accepts valid voucher code and normalizes it to uppercase", () => {
      const res = validateVoucherApplication({ code_voucher: " summer10 " });
      assert.ok(res.ok);
      assert.equal(res.value.code_voucher, "SUMMER10");
    });

    test("rejects empty or missing code_voucher", () => {
      assert.ok(!validateVoucherApplication({}).ok);
      assert.ok(!validateVoucherApplication({ code_voucher: "" }).ok);
      assert.ok(!validateVoucherApplication({ code_voucher: "   " }).ok);
      assert.ok(!validateVoucherApplication(null).ok);
    });

    test("rejects code_voucher exceeding max length", () => {
      const res = validateVoucherApplication({ code_voucher: "A".repeat(101) });
      assert.ok(!res.ok);
    });
  });

  // ── validateCreateVoucher ────────────────────────────────────────────────
  describe("validateCreateVoucher", () => {
    test("accepts valid percentage voucher payload", () => {
      const payload = {
        code_voucher: "summer10",
        name_voucher: "Summer 10% Off",
        discount_type: "percentage",
        discount_value: 10,
        minimum_order_amount: 500000,
        maximum_discount_amount: 100000,
        usage_limit: 100,
        start_at: "2026-09-01T00:00:00Z",
        end_at: "2026-09-30T23:59:59Z",
        is_active: true,
      };
      const res = validateCreateVoucher(payload);
      assert.ok(res.ok);
      assert.equal(res.value.code_voucher, "SUMMER10");
      assert.equal(res.value.name_voucher, "Summer 10% Off");
      assert.equal(res.value.discount_type, "percentage");
      assert.equal(res.value.discount_value, 10);
      assert.equal(res.value.minimum_order_amount, 500000);
      assert.equal(res.value.maximum_discount_amount, 100000);
      assert.equal(res.value.usage_limit, 100);
      assert.ok(res.value.start_at);
      assert.ok(res.value.end_at);
      assert.equal(res.value.is_active, true);
    });

    test("accepts valid fixed_amount voucher payload and sets maximum_discount_amount to null", () => {
      const payload = {
        code_voucher: "SALE50K",
        name_voucher: "Giảm 50K",
        discount_type: "fixed_amount",
        discount_value: 50000,
        minimum_order_amount: 300000,
      };
      const res = validateCreateVoucher(payload);
      assert.ok(res.ok);
      assert.equal(res.value.discount_type, "fixed_amount");
      assert.equal(res.value.discount_value, 50000);
      assert.equal(res.value.maximum_discount_amount, null);
      assert.equal(res.value.usage_limit, null);
      assert.equal(res.value.is_active, true);
    });

    test("rejects missing required fields", () => {
      const res = validateCreateVoucher({});
      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "code_voucher"));
      assert.ok(res.errors.some((e) => e.field === "name_voucher"));
      assert.ok(res.errors.some((e) => e.field === "discount_type"));
      assert.ok(res.errors.some((e) => e.field === "discount_value"));
    });

    test("rejects invalid discount_type", () => {
      const res = validateCreateVoucher({
        code_voucher: "CODE",
        name_voucher: "Name",
        discount_type: "cashback",
        discount_value: 10,
      });
      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "discount_type"));
    });

    test("rejects percentage discount_value <= 0 or > 100", () => {
      assert.ok(!validateCreateVoucher({
        code_voucher: "CODE",
        name_voucher: "Name",
        discount_type: "percentage",
        discount_value: 0,
      }).ok);

      assert.ok(!validateCreateVoucher({
        code_voucher: "CODE",
        name_voucher: "Name",
        discount_type: "percentage",
        discount_value: 101,
      }).ok);
    });

    test("rejects fixed_amount discount_value <= 0", () => {
      assert.ok(!validateCreateVoucher({
        code_voucher: "CODE",
        name_voucher: "Name",
        discount_type: "fixed_amount",
        discount_value: -50000,
      }).ok);
    });

    test("rejects invalid start_at > end_at", () => {
      const res = validateCreateVoucher({
        code_voucher: "CODE",
        name_voucher: "Name",
        discount_type: "percentage",
        discount_value: 10,
        start_at: "2026-10-01T00:00:00Z",
        end_at: "2026-09-01T00:00:00Z",
      });
      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "start_at"));
    });

    test("rejects forbidden system fields", () => {
      const res = validateCreateVoucher({
        code_voucher: "CODE",
        name_voucher: "Name",
        discount_type: "percentage",
        discount_value: 10,
        voucher_id: 1,
        usage_count: 5,
        created_at: "2026-01-01",
      });
      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "voucher_id"));
      assert.ok(res.errors.some((e) => e.field === "usage_count"));
    });

    test("handles non-object input", () => {
      assert.ok(!validateCreateVoucher(null).ok);
    });
  });

  // ── validateUpdateVoucher ────────────────────────────────────────────────
  describe("validateUpdateVoucher", () => {
    test("accepts partial updates", () => {
      const res = validateUpdateVoucher({
        name_voucher: "New Voucher Name",
        minimum_order_amount: 600000,
        maximum_discount_amount: 200000,
      });
      assert.ok(res.ok);
      assert.equal(res.value.name_voucher, "New Voucher Name");
      assert.equal(res.value.minimum_order_amount, 600000);
      assert.equal(res.value.maximum_discount_amount, 200000);
    });

    test("normalizes updated code_voucher", () => {
      const res = validateUpdateVoucher({ code_voucher: "  sale2026  " });
      assert.ok(res.ok);
      assert.equal(res.value.code_voucher, "SALE2026");
    });

    test("rejects forbidden fields on update", () => {
      const res = validateUpdateVoucher({ usage_count: 10 });
      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "usage_count"));
    });

    test("rejects empty update body", () => {
      const res = validateUpdateVoucher({});
      assert.ok(!res.ok);
    });
  });

  // ── validateUpdateVoucherStatus ──────────────────────────────────────────
  describe("validateUpdateVoucherStatus", () => {
    test("accepts boolean is_active", () => {
      assert.ok(validateUpdateVoucherStatus({ is_active: true }).ok);
      assert.ok(validateUpdateVoucherStatus({ is_active: false }).ok);
    });

    test("rejects non-boolean is_active", () => {
      assert.ok(!validateUpdateVoucherStatus({ is_active: "true" }).ok);
      assert.ok(!validateUpdateVoucherStatus({}).ok);
    });
  });

  // ── validateVoucherQuery ─────────────────────────────────────────────────
  describe("validateVoucherQuery", () => {
    test("returns defaults for empty query", () => {
      const res = validateVoucherQuery({});
      assert.ok(res.ok);
      assert.equal(res.value.page, 1);
      assert.equal(res.value.limit, 20);
      assert.equal(res.value.sort, "created_desc");
    });

    test("validates custom query parameters", () => {
      const res = validateVoucherQuery({
        page: "2",
        limit: "50",
        search: "summer",
        discount_type: "percentage",
        status: "active",
        sort: "code_asc",
      });
      assert.ok(res.ok);
      assert.equal(res.value.page, 2);
      assert.equal(res.value.limit, 50);
      assert.equal(res.value.search, "summer");
      assert.equal(res.value.discount_type, "percentage");
      assert.equal(res.value.status, "active");
      assert.equal(res.value.sort, "code_asc");
    });

    test("rejects invalid sort or status", () => {
      assert.ok(!validateVoucherQuery({ sort: "invalid_sort" }).ok);
      assert.ok(!validateVoucherQuery({ status: "invalid_status" }).ok);
    });
  });
});
