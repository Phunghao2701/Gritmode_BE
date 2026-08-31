import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createEmailService } from "../../../src/services/email.service.js";

describe("email service", () => {
  test("sends OTP through the configured transport without logging the OTP", async () => {
    let message;
    const service = createEmailService({
      env: {
        EMAIL_USER: "sender@example.com",
        CLIENT_ID: "client-id",
        CLIENT_SECRET: "client-secret",
        REFRESH_TOKEN: "refresh-token",
      },
      transportFactory: (config) => ({
        verify: async () => true,
        sendMail: async (input) => {
          message = input;
          assert.equal(config.auth.type, "OAuth2");
          return { messageId: "message-1" };
        },
      }),
    });

    const result = await service.sendOtpEmail({ email: "user@example.com", otp: "123456" });
    assert.equal(message.to, "user@example.com");
    assert.match(message.text, /123456/);
    assert.equal(result.message_id, "message-1");
  });

  test("rejects missing OAuth configuration", async () => {
    const service = createEmailService({ env: {}, transportFactory: () => assert.fail() });
    await assert.rejects(
      () => service.sendOtpEmail({ email: "user@example.com", otp: "123456" }),
      (error) => error.code === "EMAIL_CONFIG_MISSING" && error.statusCode === 500,
    );
  });

  test("maps provider failures to EMAIL_DELIVERY_FAILED", async () => {
    const service = createEmailService({
      env: {
        EMAIL_USER: "sender@example.com",
        CLIENT_ID: "client-id",
        CLIENT_SECRET: "client-secret",
        REFRESH_TOKEN: "refresh-token",
      },
      transportFactory: () => ({ sendMail: async () => { throw new Error("provider failed"); } }),
    });
    await assert.rejects(
      () => service.sendOtpEmail({ email: "user@example.com", otp: "123456" }),
      (error) => error.code === "EMAIL_DELIVERY_FAILED" && error.statusCode === 502,
    );
  });
});
