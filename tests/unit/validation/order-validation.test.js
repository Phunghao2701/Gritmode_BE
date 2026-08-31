import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateCheckout } from "../../../src/utils/validation.js";

describe("order checkout validation primitives", () => {
  const validGuestAddress = {
    email_order: "guest@example.com",
    phone_order: "0901234567",
    receiver_name_order_address: "Nguyen Van A",
    phone_order_address: "0901234567",
    address_line_order_address: "123 Nguyen Trai",
    ward_order_address: "Ben Thanh",
    district_order_address: "District 1",
    province_order_address: "Ho Chi Minh City",
  };

  // ── Guest Checkout Validation ────────────────────────────────────────────
  describe("Guest Checkout Validation", () => {
    test("accepts valid guest checkout payload with COD", () => {
      const res = validateCheckout(
        {
          guest_token: "guest_1234567890abcdef",
          payment_method: "cod",
          voucher_code: " SUMMER10 ",
          note_order: " Giao giờ hành chính ",
          ...validGuestAddress,
        },
        { isAuthenticated: false },
      );

      assert.ok(res.ok);
      assert.equal(res.value.payment_method, "cod");
      assert.equal(res.value.voucher_code, "SUMMER10");
      assert.equal(res.value.note_order, "Giao giờ hành chính");
      assert.equal(res.value.email_order, "guest@example.com");
      assert.equal(res.value.phone_order, "0901234567");
      assert.equal(res.value.receiver_name_order_address, "Nguyen Van A");
    });

    test("accepts valid guest checkout payload with payOS", () => {
      const res = validateCheckout(
        {
          payment_method: "payos",
          ...validGuestAddress,
        },
        { isAuthenticated: false },
      );

      assert.ok(res.ok);
      assert.equal(res.value.payment_method, "payos");
    });

    test("rejects missing required guest address or contact fields", () => {
      const invalid = validateCheckout(
        {
          payment_method: "cod",
          email_order: "invalid-email",
        },
        { isAuthenticated: false },
      );

      assert.ok(!invalid.ok);
      assert.ok(invalid.errors.some((e) => e.field === "email_order"));
      assert.ok(invalid.errors.some((e) => e.field === "phone_order"));
      assert.ok(invalid.errors.some((e) => e.field === "receiver_name_order_address"));
      assert.ok(invalid.errors.some((e) => e.field === "address_line_order_address"));
    });

    test("rejects invalid payment method", () => {
      const res = validateCheckout(
        {
          payment_method: "crypto",
          ...validGuestAddress,
        },
        { isAuthenticated: false },
      );

      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "payment_method"));
    });
  });

  // ── Authenticated User Checkout Validation ───────────────────────────────
  describe("Authenticated User Checkout Validation", () => {
    test("accepts user checkout with user_address_id", () => {
      const res = validateCheckout(
        {
          user_address_id: 10,
          payment_method: "cod",
          voucher_code: "DISCOUNT50",
        },
        { isAuthenticated: true },
      );

      assert.ok(res.ok);
      assert.equal(res.value.user_address_id, 10);
      assert.equal(res.value.payment_method, "cod");
      assert.equal(res.value.voucher_code, "DISCOUNT50");
    });

    test("accepts user checkout with inline address fields", () => {
      const res = validateCheckout(
        {
          payment_method: "payos",
          ...validGuestAddress,
        },
        { isAuthenticated: true },
      );

      assert.ok(res.ok);
      assert.equal(res.value.payment_method, "payos");
      assert.equal(res.value.receiver_name_order_address, "Nguyen Van A");
    });

    test("rejects user checkout when neither user_address_id nor complete inline address is given", () => {
      const res = validateCheckout(
        {
          payment_method: "cod",
        },
        { isAuthenticated: true },
      );

      assert.ok(!res.ok);
      assert.ok(res.errors.some((e) => e.field === "address" || e.field === "user_address_id"));
    });
  });
});
