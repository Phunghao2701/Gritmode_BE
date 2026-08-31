import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCreatePayOSPayment,
  validatePayOSWebhook,
} from "../../../src/utils/validation.js";

describe("payment validation primitives", () => {
  describe("validateCreatePayOSPayment", () => {
    test("accepts valid order_id", () => {
      const res = validateCreatePayOSPayment({ order_id: 100 });
      assert.ok(res.ok);
      assert.equal(res.value.order_id, 100);
    });

    test("accepts orderId alias", () => {
      const res = validateCreatePayOSPayment({ orderId: 100 });
      assert.ok(res.ok);
      assert.equal(res.value.order_id, 100);
    });

    test("rejects invalid or missing order_id", () => {
      assert.ok(!validateCreatePayOSPayment({}).ok);
      assert.ok(!validateCreatePayOSPayment({ order_id: -1 }).ok);
      assert.ok(!validateCreatePayOSPayment({ order_id: "abc" }).ok);
    });
  });

  describe("validatePayOSWebhook", () => {
    test("accepts valid webhook structure", () => {
      const res = validatePayOSWebhook({
        code: "00",
        desc: "success",
        success: true,
        data: {
          orderCode: 123456,
          amount: 500000,
        },
        signature: "a".repeat(64),
      });
      assert.ok(res.ok);
      assert.equal(res.value.data.orderCode, 123456);
    });

    test("rejects missing data or signature", () => {
      assert.ok(!validatePayOSWebhook(null).ok);
      assert.ok(!validatePayOSWebhook({ data: {} }).ok);
      assert.ok(!validatePayOSWebhook({ signature: "sig" }).ok);
    });
  });
});
