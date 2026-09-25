import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import {
  generatePayOSOrderCode,
  createPayOSSignature,
  verifyPayOSWebhookSignature,
  callPayOSCreatePaymentLink,
  getPayOSPaymentLinkInfo,
} from "../../../src/utils/payos.js";

describe("payOS utils and signature verification", () => {
  const checksumKey = "test_checksum_key_12345";

  afterEach(() => {
    mock.restoreAll();
  });

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
    assert.equal(verifyPayOSWebhookSignature(null, checksumKey), false);
    assert.equal(verifyPayOSWebhookSignature({}, checksumKey), false);

    const tamperedBody = {
      ...webhookBody,
      data: { ...data, amount: 1000 },
    };
    assert.equal(verifyPayOSWebhookSignature(tamperedBody, checksumKey), false);
  });

  test("callPayOSCreatePaymentLink handles success, api error and network error", async () => {
    process.env.PAYOS_CLIENT_ID = "valid_client_id";
    process.env.PAYOS_API_KEY = "valid_api_key";
    process.env.PAYOS_CHECKSUM_KEY = "valid_checksum_key";

    mock.method(axios, "post", async () => ({
      data: {
        code: "00",
        data: {
          checkoutUrl: "https://pay.payos.vn/100",
          qrCode: "QR100",
        },
      },
    }));

    const result = await callPayOSCreatePaymentLink({
      orderCode: 1001,
      amount: 500000,
    });
    assert.equal(result.checkoutUrl, "https://pay.payos.vn/100");

    // Non-00 code
    mock.method(axios, "post", async () => ({
      data: { code: "01", desc: "error" },
    }));
    assert.equal(await callPayOSCreatePaymentLink({ orderCode: 1002, amount: 500000 }), null);

    // Network exception
    mock.method(axios, "post", async () => {
      throw new Error("network_fail");
    });
    assert.equal(await callPayOSCreatePaymentLink({ orderCode: 1003, amount: 500000 }), null);
  });

  test("getPayOSPaymentLinkInfo handles success and error responses", async () => {
    mock.method(axios, "get", async () => ({
      data: {
        code: "00",
        data: {
          status: "PAID",
          amountPaid: 500000,
        },
      },
    }));

    const res = await getPayOSPaymentLinkInfo(1001);
    assert.equal(res.status, "PAID");

    // Non-00 code
    mock.method(axios, "get", async () => ({
      data: { code: "01" },
    }));
    assert.equal(await getPayOSPaymentLinkInfo(1002), null);

    // Network error
    mock.method(axios, "get", async () => {
      throw new Error("conn_reset");
    });
    assert.equal(await getPayOSPaymentLinkInfo(1003), null);
  });
});
