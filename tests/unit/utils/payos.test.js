import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  generatePayOSOrderCode,
  createPayOSSignature,
  verifyPayOSWebhookSignature,
} from "../../../src/utils/payos.js";

describe("payOS utils and signature verification", () => {
  const checksumKey = "test_checksum_key_12345";

  test("generatePayOSOrderCode generates positive numeric code", () => {
    const code1 = generatePayOSOrderCode();
    const code2 = generatePayOSOrderCode();
    assert.equal(typeof code1, "number");
    assert.ok(code1 > 0);
    assert.notEqual(code1, code2);
  });

  test("createPayOSSignature creates deterministic HMAC-SHA256 signature from sorted keys", () => {
    const data = {
      orderCode: 123456,
      amount: 500000,
      description: "DH100",
      returnUrl: "https://example.com/return",
      cancelUrl: "https://example.com/cancel",
    };

    const sig1 = createPayOSSignature(data, checksumKey);
    const sig2 = createPayOSSignature(data, checksumKey);
    assert.equal(typeof sig1, "string");
    assert.equal(sig1.length, 64);
    assert.equal(sig1, sig2);
  });

  test("verifyPayOSWebhookSignature verifies valid signature and rejects tampered signature", () => {
    const data = {
      orderCode: 123456,
      amount: 500000,
      description: "DH100",
      accountNumber: "123456789",
      reference: "FT260831",
      transactionDateTime: "2026-08-31 18:00:00",
      currency: "VND",
      paymentLinkId: "link_123",
      code: "00",
      desc: "success",
    };

    const signature = createPayOSSignature(data, checksumKey);
    const webhookBody = {
      code: "00",
      desc: "success",
      success: true,
      data,
      signature,
    };

    assert.equal(verifyPayOSWebhookSignature(webhookBody, checksumKey), true);

    const tamperedBody = {
      ...webhookBody,
      data: { ...data, amount: 1000 },
    };
    assert.equal(verifyPayOSWebhookSignature(tamperedBody, checksumKey), false);
  });
});
