import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAddCartItem,
  validateUpdateCartItem,
  validateCartItemId,
  isValidGuestToken,
} from "../../../src/utils/cart-validation.js";

describe("cart validation primitives", () => {
  // ── validateAddCartItem ──────────────────────────────────────────────────
  describe("validateAddCartItem", () => {
    test("accepts valid product_variant_id and quantity", () => {
      const res = validateAddCartItem({ product_variant_id: 101, quantity: 2 });
      assert.ok(res.ok);
      assert.equal(res.value.product_variant_id, 101);
      assert.equal(res.value.quantity, 2);
    });

    test("accepts quantity_cart_item as alias for quantity", () => {
      const res = validateAddCartItem({ product_variant_id: 101, quantity_cart_item: 3 });
      assert.ok(res.ok);
      assert.equal(res.value.product_variant_id, 101);
      assert.equal(res.value.quantity, 3);
    });

    test("rejects missing or invalid fields", () => {
      assert.ok(!validateAddCartItem({}).ok);
      assert.ok(!validateAddCartItem({ product_variant_id: 0, quantity: 1 }).ok);
      assert.ok(!validateAddCartItem({ product_variant_id: 101, quantity: 0 }).ok);
      assert.ok(!validateAddCartItem({ product_variant_id: 101, quantity: -1 }).ok);
      assert.ok(!validateAddCartItem({ product_variant_id: "abc", quantity: 1 }).ok);
    });
  });

  // ── validateUpdateCartItem ───────────────────────────────────────────────
  describe("validateUpdateCartItem", () => {
    test("accepts valid quantity", () => {
      const res = validateUpdateCartItem({ quantity: 5 });
      assert.ok(res.ok);
      assert.equal(res.value.quantity, 5);
    });

    test("accepts quantity_cart_item as alias for quantity", () => {
      const res = validateUpdateCartItem({ quantity_cart_item: 4 });
      assert.ok(res.ok);
      assert.equal(res.value.quantity, 4);
    });

    test("rejects non-positive quantity or forbidden extra fields", () => {
      assert.ok(!validateUpdateCartItem({ quantity: 0 }).ok);
      assert.ok(!validateUpdateCartItem({ quantity: -2 }).ok);
      assert.ok(!validateUpdateCartItem({ quantity: 2, price: 1000 }).ok);
      assert.ok(!validateUpdateCartItem({}).ok);
    });
  });

  // ── validateCartItemId & isValidGuestToken ────────────────────────────────
  describe("validateCartItemId and isValidGuestToken", () => {
    test("validateCartItemId parses positive integers", () => {
      assert.equal(validateCartItemId("123"), 123);
      assert.equal(validateCartItemId(456), 456);
      assert.throws(() => validateCartItemId("0"));
      assert.throws(() => validateCartItemId("-5"));
      assert.throws(() => validateCartItemId("abc"));
    });

    test("isValidGuestToken validates token length and characters", () => {
      assert.equal(isValidGuestToken("guest_1234567890abcdef"), true);
      assert.equal(isValidGuestToken("short"), false);
      assert.equal(isValidGuestToken(null), false);
    });
  });
});
