import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateRequestOtp,
  validateVerifyOtp,
  validateRefreshToken,
} from "../../../src/utils/validation.js";

describe("auth validation primitives", () => {
  // ── validateRequestOtp ───────────────────────────────────────────────────
  describe("validateRequestOtp", () => {
    test("accepts valid email and normalizes it to lowercase", () => {
      const res = validateRequestOtp({ email: " User@Example.COM " });
      assert.ok(res.ok);
      assert.equal(res.value.email, "user@example.com");
    });

    test("rejects missing or invalid email", () => {
      assert.ok(!validateRequestOtp({}).ok);
      assert.ok(!validateRequestOtp({ email: "" }).ok);
      assert.ok(!validateRequestOtp({ email: "invalid-email" }).ok);
      assert.ok(!validateRequestOtp({ email: "user@" }).ok);
      assert.ok(!validateRequestOtp(null).ok);
    });

    test("rejects email exceeding max length", () => {
      const longEmail = `${"a".repeat(250)}@example.com`;
      const res = validateRequestOtp({ email: longEmail });
      assert.ok(!res.ok);
    });
  });

  // ── validateVerifyOtp ────────────────────────────────────────────────────
  describe("validateVerifyOtp", () => {
    test("accepts valid email and 6-digit numeric otp with optional guest_token", () => {
      const res = validateVerifyOtp({
        email: " USER@TEST.COM ",
        otp: "123456",
        guest_token: "guest_abc",
      });
      assert.ok(res.ok);
      assert.equal(res.value.email, "user@test.com");
      assert.equal(res.value.otp, "123456");
      assert.equal(res.value.guest_token, "guest_abc");
    });

    test("rejects missing or invalid otp format", () => {
      assert.ok(!validateVerifyOtp({ email: "u@test.com", otp: "12345" }).ok);
      assert.ok(!validateVerifyOtp({ email: "u@test.com", otp: "1234567" }).ok);
      assert.ok(!validateVerifyOtp({ email: "u@test.com", otp: "abcdef" }).ok);
      assert.ok(!validateVerifyOtp({ email: "u@test.com", otp: "" }).ok);
      assert.ok(!validateVerifyOtp({ email: "u@test.com" }).ok);
    });

    test("rejects missing email", () => {
      assert.ok(!validateVerifyOtp({ otp: "123456" }).ok);
    });
  });

  // ── validateRefreshToken ─────────────────────────────────────────────────
  describe("validateRefreshToken", () => {
    test("accepts valid refresh token", () => {
      const res = validateRefreshToken({ refresh_token: "valid_refresh_token_string" });
      assert.ok(res.ok);
      assert.equal(res.value.refresh_token, "valid_refresh_token_string");
    });

    test("rejects empty or non-string refresh token", () => {
      assert.ok(!validateRefreshToken({}).ok);
      assert.ok(!validateRefreshToken({ refresh_token: "" }).ok);
      assert.ok(!validateRefreshToken({ refresh_token: "   " }).ok);
      assert.ok(!validateRefreshToken(null).ok);
    });
  });
});
