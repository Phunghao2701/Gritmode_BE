import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createAuthService } from "../../../src/services/auth.service.js";
import { hashToken } from "../../../src/utils/tokens.js";

const baseUser = {
  user_id: "u1",
  email: "user@example.com",
  status: "active",
  role: "customer",
  full_name: null,
  email_verified_at: new Date().toISOString(),
};

describe("auth service (Passwordless Email OTP)", () => {
  const transaction = async (fn) => fn({});
  const baseOptions = {
    accessSecret: "secret",
    accessExpiresIn: "15m",
    refreshTtlMs: 1000,
  };

  // ── requestOtp ───────────────────────────────────────────────────────────
  describe("requestOtp", () => {
    test("generates OTP, hashes and saves record, sends email, returns expired_in", async () => {
      let savedRecord = null;
      let sentEmail = null;

      const service = createAuthService({
        emailOtps: {
          findRecentByEmail: async () => null,
          create: async (data) => {
            savedRecord = data;
            return { email_otp_id: 1, ...data };
          },
        },
        emails: {
          sendOtpEmail: async (data) => {
            sentEmail = data;
          },
        },
        otpGenerator: () => "123456",
        tokenOptions: baseOptions,
        transaction,
      });

      const res = await service.requestOtp({ email: " Customer@Example.com " });
      assert.ok(res);
      assert.equal(res.expired_in, 300);
      assert.ok(savedRecord);
      assert.equal(savedRecord.email, "customer@example.com");
      assert.equal(savedRecord.otpHash, hashToken("123456"));
      assert.ok(sentEmail);
      assert.equal(sentEmail.email, "customer@example.com");
      assert.equal(sentEmail.otp, "123456");
    });

    test("throws 429 OTP_RATE_LIMITED when request is sent too frequently", async () => {
      const service = createAuthService({
        emailOtps: {
          findRecentByEmail: async () => ({ email_otp_id: 1, created_at: new Date() }),
        },
        tokenOptions: baseOptions,
        transaction,
      });

      await assert.rejects(
        () => service.requestOtp({ email: "user@example.com" }),
        (err) => {
          assert.equal(err.statusCode, 429);
          assert.equal(err.code, "OTP_RATE_LIMITED");
          return true;
        },
      );
    });
  });

  // ── verifyOtp ────────────────────────────────────────────────────────────
  describe("verifyOtp", () => {
    test("verifies OTP, auto-creates new user when email not registered, issues session and tokens", async () => {
      let createdUser = false;
      let markedVerified = false;
      let createdSession = false;

      const validOtpRecord = {
        email_otp_id: 1,
        email: "newuser@example.com",
        otp_hash: hashToken("123456"),
        attempt_count: 0,
        expired_at: new Date(Date.now() + 100000),
        verified_at: null,
      };

      const service = createAuthService({
        emailOtps: {
          findLatestByEmail: async () => validOtpRecord,
          markVerified: async () => { markedVerified = true; },
          incrementAttempt: async () => {},
        },
        users: {
          findByEmail: async () => null,
          createFromOtp: async (data) => {
            createdUser = true;
            return { user_id: "new-u1", ...data, status: "active", role: "customer" };
          },
        },
        sessions: {
          create: async () => {
            createdSession = true;
            return { user_session_id: 10 };
          },
        },
        tokenOptions: baseOptions,
        transaction,
      });

      const res = await service.verifyOtp({ email: "newuser@example.com", otp: "123456" });
      assert.ok(res);
      assert.equal(res.is_new_user, true);
      assert.equal(createdUser, true);
      assert.equal(markedVerified, true);
      assert.equal(createdSession, true);
      assert.ok(res.access_token);
      assert.ok(res.refresh_token);
      assert.equal(res.user.email, "newuser@example.com");
    });

    test("verifies OTP and logs in existing active user", async () => {
      const validOtpRecord = {
        email_otp_id: 1,
        email: "user@example.com",
        otp_hash: hashToken("654321"),
        attempt_count: 1,
        expired_at: new Date(Date.now() + 100000),
        verified_at: null,
      };

      const service = createAuthService({
        emailOtps: {
          findLatestByEmail: async () => validOtpRecord,
          markVerified: async () => {},
          incrementAttempt: async () => {},
        },
        users: {
          findByEmail: async () => baseUser,
        },
        sessions: {
          create: async () => ({ user_session_id: 11 }),
        },
        tokenOptions: baseOptions,
        transaction,
      });

      const res = await service.verifyOtp({ email: "user@example.com", otp: "654321" });
      assert.ok(res);
      assert.equal(res.is_new_user, false);
      assert.equal(res.user.user_id, "u1");
    });

    test("merges guest cart during verifyOtp if guest_token is provided", async () => {
      let mergedCart = false;
      const validOtpRecord = {
        email_otp_id: 1,
        email: "user@example.com",
        otp_hash: hashToken("111222"),
        attempt_count: 0,
        expired_at: new Date(Date.now() + 100000),
        verified_at: null,
      };

      const service = createAuthService({
        emailOtps: {
          findLatestByEmail: async () => validOtpRecord,
          markVerified: async () => {},
          incrementAttempt: async () => {},
        },
        users: {
          findByEmail: async () => baseUser,
        },
        carts: {
          mergeGuestCart: async ({ guestToken, userId }) => {
            if (guestToken === "guest-123" && userId === "u1") mergedCart = true;
          },
        },
        sessions: {
          create: async () => ({ user_session_id: 12 }),
        },
        tokenOptions: baseOptions,
        transaction,
      });

      const res = await service.verifyOtp({ email: "user@example.com", otp: "111222", guest_token: "guest-123" });
      assert.ok(res);
      assert.equal(mergedCart, true);
    });

    test("throws 401 INVALID_OTP when no OTP found or expired", async () => {
      const service = createAuthService({
        emailOtps: {
          findLatestByEmail: async () => null,
        },
        tokenOptions: baseOptions,
        transaction,
      });

      await assert.rejects(
        () => service.verifyOtp({ email: "user@example.com", otp: "123456" }),
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.equal(err.code, "INVALID_OTP");
          return true;
        },
      );

      const expiredService = createAuthService({
        emailOtps: {
          findLatestByEmail: async () => ({
            email_otp_id: 1,
            otp_hash: hashToken("123456"),
            attempt_count: 0,
            expired_at: new Date(Date.now() - 1000),
          }),
        },
        tokenOptions: baseOptions,
        transaction,
      });

      await assert.rejects(
        () => expiredService.verifyOtp({ email: "user@example.com", otp: "123456" }),
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.equal(err.code, "INVALID_OTP");
          return true;
        },
      );
    });

    test("throws 429 OTP_ATTEMPTS_EXCEEDED when attempt_count >= 5", async () => {
      const service = createAuthService({
        emailOtps: {
          findLatestByEmail: async () => ({
            email_otp_id: 1,
            otp_hash: hashToken("123456"),
            attempt_count: 5,
            expired_at: new Date(Date.now() + 100000),
          }),
        },
        tokenOptions: baseOptions,
        transaction,
      });

      await assert.rejects(
        () => service.verifyOtp({ email: "user@example.com", otp: "123456" }),
        (err) => {
          assert.equal(err.statusCode, 429);
          assert.equal(err.code, "OTP_ATTEMPTS_EXCEEDED");
          return true;
        },
      );
    });

    test("increments attempt count and throws 401 on incorrect OTP hash", async () => {
      let incremented = false;
      const service = createAuthService({
        emailOtps: {
          findLatestByEmail: async () => ({
            email_otp_id: 1,
            otp_hash: hashToken("123456"),
            attempt_count: 2,
            expired_at: new Date(Date.now() + 100000),
          }),
          incrementAttempt: async () => { incremented = true; },
        },
        tokenOptions: baseOptions,
        transaction,
      });

      await assert.rejects(
        () => service.verifyOtp({ email: "user@example.com", otp: "999999" }),
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.equal(err.code, "INVALID_OTP");
          return true;
        },
      );
      assert.equal(incremented, true);
    });

    test("rejects blocked or inactive existing users", async () => {
      const blockedService = createAuthService({
        emailOtps: {
          findLatestByEmail: async () => ({
            email_otp_id: 1,
            otp_hash: hashToken("123456"),
            attempt_count: 0,
            expired_at: new Date(Date.now() + 100000),
          }),
          markVerified: async () => {},
        },
        users: {
          findByEmail: async () => ({ ...baseUser, status: "blocked" }),
        },
        tokenOptions: baseOptions,
        transaction,
      });

      await assert.rejects(
        () => blockedService.verifyOtp({ email: "user@example.com", otp: "123456" }),
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.equal(err.code, "ACCOUNT_BLOCKED");
          return true;
        },
      );
    });
  });

  // ── refresh ──────────────────────────────────────────────────────────────
  describe("googleLogin", () => {
    test("verifies Google identity and reuses the shared session pipeline", async () => {
      let createdUserInput;
      const service = createAuthService({
        verifyGoogleToken: async () => ({
          email: "New.User@Example.com",
          email_verified: true,
          name: "New User",
          picture: "https://example.com/avatar.jpg",
        }),
        users: {
          findByEmail: async () => null,
          createFromOtp: async (input) => {
            createdUserInput = input;
            return { ...baseUser, email: input.email, full_name: input.fullName, url_image: input.urlImage };
          },
        },
        sessions: { create: async () => ({ user_session_id: 13 }) },
        tokenOptions: baseOptions,
        transaction,
      });

      const result = await service.googleLogin({ access_token: "verified-google-access-token" });

      assert.equal(result.is_new_user, true);
      assert.equal(result.user.email, "new.user@example.com");
      assert.equal(createdUserInput.fullName, "New User");
      assert.ok(result.access_token);
      assert.ok(result.refresh_token);
    });

    test("rejects an unverified Google email", async () => {
      const service = createAuthService({
        verifyGoogleToken: async () => ({ email: "user@example.com", email_verified: false }),
        tokenOptions: baseOptions,
        transaction,
      });
      await assert.rejects(
        () => service.googleLogin({ access_token: "unverified-google-access-token" }),
        (error) => error.statusCode === 401 && error.code === "GOOGLE_EMAIL_UNVERIFIED",
      );
    });
  });

  describe("refresh", () => {
    test("rotates refresh token and issues new access token", async () => {
      let revokedSessionId = null;
      const validHash = hashToken("valid-refresh-token");

      const service = createAuthService({
        sessions: {
          findActiveByHash: async (hash) => {
            if (hash === validHash) return { user_session_id: 5, user_id: "u1" };
            return null;
          },
          revoke: async (id) => {
            revokedSessionId = id;
          },
          create: async () => ({ user_session_id: 7 }),
        },
        users: {
          findById: async (id) => (id === "u1" ? baseUser : null),
        },
        tokenOptions: baseOptions,
        transaction,
      });

      const rotated = await service.refresh("valid-refresh-token");
      assert.ok(rotated.access_token);
      assert.ok(rotated.refresh_token);
      assert.equal(revokedSessionId, 5);
    });

    test("throws 401 when refresh token missing or invalid", async () => {
      const service = createAuthService({
        sessions: { findActiveByHash: async () => null },
        tokenOptions: baseOptions,
        transaction,
      });

      await assert.rejects(
        () => service.refresh(""),
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.equal(err.code, "REFRESH_TOKEN_REQUIRED");
          return true;
        },
      );

      await assert.rejects(
        () => service.refresh("invalid-token"),
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.equal(err.code, "REFRESH_TOKEN_INVALID");
          return true;
        },
      );
    });
  });

  // ── logout & me ──────────────────────────────────────────────────────────
  describe("logout and me", () => {
    test("logout revokes session by hash", async () => {
      let revokedHash = null;
      const service = createAuthService({
        sessions: {
          revokeByHash: async (hash) => { revokedHash = hash; },
        },
        tokenOptions: baseOptions,
        transaction,
      });

      await service.logout("token-123");
      assert.equal(revokedHash, hashToken("token-123"));
    });

    test("me returns user profile", async () => {
      const service = createAuthService({
        users: {
          findById: async (id) => (id === "u1" ? baseUser : null),
        },
        tokenOptions: baseOptions,
        transaction,
      });

      const user = await service.me("u1");
      assert.equal(user.email, "user@example.com");
    });
  });
});
