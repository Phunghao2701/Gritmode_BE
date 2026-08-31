import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateOrderId,
  validateUserOrderQuery,
  validateGuestOrderLookup,
  validateGuestOrderCancel,
} from "../../../src/utils/validation.js";

describe("order management validation primitives", () => {
  // ── validateOrderId ──────────────────────────────────────────────────────
  describe("validateOrderId", () => {
    test("accepts valid positive integer", () => {
      const res = validateOrderId("10");
      assert.ok(res.ok);
      assert.equal(res.value, 10);
    });

    test("rejects invalid, negative or zero ID", () => {
      assert.ok(!validateOrderId("abc").ok);
      assert.ok(!validateOrderId("-1").ok);
      assert.ok(!validateOrderId("0").ok);
    });
  });

  // ── validateUserOrderQuery ───────────────────────────────────────────────
  describe("validateUserOrderQuery", () => {
    test("accepts default or valid pagination and status query", () => {
      const res = validateUserOrderQuery({ page: "2", limit: "15", status_order: "pending" });
      assert.ok(res.ok);
      assert.equal(res.value.page, 2);
      assert.equal(res.value.limit, 15);
      assert.equal(res.value.status_order, "pending");
    });

    test("rejects invalid status_order", () => {
      const res = validateUserOrderQuery({ status_order: "invalid_status" });
      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "status_order"));
    });
  });

  // ── validateGuestOrderLookup ─────────────────────────────────────────────
  describe("validateGuestOrderLookup", () => {
    test("accepts valid guest lookup payload", () => {
      const res = validateGuestOrderLookup({
        order_code: "ORD-20260831-000001",
        email: "GUEST@example.com ",
        phone: " 0901234567 ",
      });
      assert.ok(res.ok);
      assert.equal(res.value.order_code, "ORD-20260831-000001");
      assert.equal(res.value.email, "guest@example.com");
      assert.equal(res.value.phone, "0901234567");
    });

    test("rejects missing or invalid fields", () => {
      const res = validateGuestOrderLookup({
        order_code: "",
        email: "invalid-email",
        phone: "123",
      });
      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "order_code"));
      assert.ok(res.errors.some((e) => e.field === "email"));
      assert.ok(res.errors.some((e) => e.field === "phone"));
    });
  });

  // ── validateGuestOrderCancel ─────────────────────────────────────────────
  describe("validateGuestOrderCancel", () => {
    test("accepts valid guest cancel verification payload", () => {
      const res = validateGuestOrderCancel({
        email: "guest@example.com",
        phone: "0901234567",
      });
      assert.ok(res.ok);
      assert.equal(res.value.email, "guest@example.com");
      assert.equal(res.value.phone, "0901234567");
    });

    test("rejects missing or invalid email or phone", () => {
      const res = validateGuestOrderCancel({});
      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "email"));
      assert.ok(res.errors.some((e) => e.field === "phone"));
    });
  });
});
