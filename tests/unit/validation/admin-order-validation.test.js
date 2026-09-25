import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAdminOrderQuery,
  validateCancelOrder,
} from "../../../src/utils/validation.js";

describe("admin order validation primitives", () => {
  // ── validateAdminOrderQuery ──────────────────────────────────────────────
  describe("validateAdminOrderQuery", () => {
    test("returns defaults for empty query", () => {
      const res = validateAdminOrderQuery({});
      assert.ok(res.ok);
      assert.equal(res.value.page, 1);
      assert.equal(res.value.limit, 20);
      assert.equal(res.value.sort_by, "created_at");
      assert.equal(res.value.sort_order, "desc");
    });

    test("accepts valid query with all filters", () => {
      const res = validateAdminOrderQuery({
        page: "2",
        limit: "50",
        search: " ORD-001 ",
        status_order: "confirmed",
        status_payment: "paid",
        payment_method: "payos",
        from_date: "2026-08-01T00:00:00.000Z",
        to_date: "2026-08-31T23:59:59.000Z",
        sort_by: "total_order",
        sort_order: "asc",
      });

      assert.ok(res.ok);
      assert.equal(res.value.page, 2);
      assert.equal(res.value.limit, 50);
      assert.equal(res.value.search, "ORD-001");
      assert.equal(res.value.status_order, "confirmed");
      assert.equal(res.value.status_payment, "paid");
      assert.equal(res.value.payment_method, "payos");
      assert.equal(res.value.sort_by, "total_order");
      assert.equal(res.value.sort_order, "asc");
      assert.ok(res.value.from_date instanceof Date);
      assert.ok(res.value.to_date instanceof Date);
    });

    test("rejects invalid status or payment enum values", () => {
      const res = validateAdminOrderQuery({
        status_order: "invalid_status",
        status_payment: "invalid_payment_status",
        payment_method: "crypto",
      });

      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "status_order"));
      assert.ok(res.errors.some((e) => e.field === "status_payment"));
      assert.ok(res.errors.some((e) => e.field === "payment_method"));
    });

    test("rejects invalid date range (from_date > to_date)", () => {
      const res = validateAdminOrderQuery({
        from_date: "2026-09-01T00:00:00.000Z",
        to_date: "2026-08-01T00:00:00.000Z",
      });

      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "from_date"));
    });

    test("accepts partial date filters and sort by updated_at", () => {
      const res1 = validateAdminOrderQuery({ from_date: "2026-08-01T00:00:00.000Z", sort_by: "updated_at" });
      assert.ok(res1.ok);
      assert.equal(res1.value.sort_by, "updated_at");

      const res2 = validateAdminOrderQuery({ to_date: "2026-08-31T00:00:00.000Z", search: "   " });
      assert.ok(res2.ok);
      assert.equal(res2.value.search, undefined);
    });

    test("rejects invalid page, limit, dates and sort parameters", () => {
      const res = validateAdminOrderQuery({
        page: "-1",
        limit: "200",
        from_date: "invalid-date",
        to_date: "invalid-date",
        sort_by: "unknown_field",
        sort_order: "unknown_order",
      });

      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "page"));
      assert.ok(res.errors.some((e) => e.field === "limit"));
      assert.ok(res.errors.some((e) => e.field === "from_date"));
      assert.ok(res.errors.some((e) => e.field === "to_date"));
      assert.ok(res.errors.some((e) => e.field === "sort_by"));
      assert.ok(res.errors.some((e) => e.field === "sort_order"));
    });
  });

  // ── validateCancelOrder ──────────────────────────────────────────────────
  describe("validateCancelOrder", () => {
    test("accepts empty or optional reason", () => {
      const res1 = validateCancelOrder({});
      assert.ok(res1.ok);

      const res2 = validateCancelOrder({ reason: " Customer requested cancellation " });
      assert.ok(res2.ok);
      assert.equal(res2.value.reason, "Customer requested cancellation");
    });

    test("rejects non-string reason or excessively long reason", () => {
      assert.ok(!validateCancelOrder(null).ok);
      assert.ok(!validateCancelOrder({ reason: 123 }).ok);
      assert.ok(!validateCancelOrder({ reason: "a".repeat(1001) }).ok);
    });
  });
});

