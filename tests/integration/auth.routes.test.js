import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken, hashToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { emailOtpRepository } from "../../src/repositories/email-otp.repository.js";
import { sessionRepository } from "../../src/repositories/session.repository.js";
import { cartRepository } from "../../src/repositories/cart.repository.js";
import { emailService } from "../../src/services/email.service.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const validUserToken = createAccessToken(
  { user_id: "00000000-0000-4000-8000-000000000001", role: "customer", session_id: 1 },
  { secret, expiresIn: "1h" },
);

describe("authentication HTTP contract (Passwordless Email OTP)", () => {
  beforeEach(() => {
    mock.method(pool, "connect", async () => ({
      query: async () => ({ rows: [], rowCount: 1 }),
      release: () => {},
    }));
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      email: "user@example.com",
      role: "customer",
      status: "active",
    }));
    mock.method(emailService, "sendOtpEmail", async () => ({ success: true, message_id: "test-message" }));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // ── POST /auth/request-otp ───────────────────────────────────────────────
  describe("POST /api/v1/auth/request-otp", () => {
    test("requests OTP successfully with valid email", async () => {
      mock.method(emailOtpRepository, "findRecentByEmail", async () => null);
      mock.method(emailOtpRepository, "create", async (data) => ({ email_otp_id: 1, ...data }));

      const res = await request(app)
        .post("/api/v1/auth/request-otp")
        .send({ email: "customer@example.com" });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.code, "OTP_SENT");
      assert.equal(res.body.data.expired_in, 300);
    });

    test("rejects invalid email format", async () => {
      const res = await request(app)
        .post("/api/v1/auth/request-otp")
        .send({ email: "not-an-email" });

      assert.equal(res.status, 400);
      assert.equal(res.body.code, "VALIDATION_ERROR");
    });
  });

  // ── POST /auth/verify-otp ────────────────────────────────────────────────
  describe("POST /api/v1/auth/verify-otp", () => {
    test("verifies OTP and auto-registers new user", async () => {
      mock.method(emailOtpRepository, "findLatestByEmail", async () => ({
        email_otp_id: 1,
        email: "newuser@example.com",
        otp_hash: hashToken("123456"),
        attempt_count: 0,
        expired_at: new Date(Date.now() + 100000),
        verified_at: null,
      }));
      mock.method(emailOtpRepository, "markVerified", async () => ({}));
      mock.method(userRepository, "findByEmail", async () => null);
      mock.method(userRepository, "createFromOtp", async (data) => ({
        user_id: "00000000-0000-4000-8000-000000000002",
        email: "newuser@example.com",
        role: "customer",
        status: "active",
      }));
      mock.method(sessionRepository, "create", async () => ({ user_session_id: 10 }));

      const res = await request(app)
        .post("/api/v1/auth/verify-otp")
        .send({ email: "newuser@example.com", otp: "123456" });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.is_new_user, true);
      assert.ok(res.body.data.access_token);
      assert.equal(res.body.data.refresh_token, undefined);
      assert.equal(res.body.data.user.email, "newuser@example.com");
      const cookie = res.headers["set-cookie"]?.[0] || "";
      assert.match(cookie, /refresh_token=/);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.match(cookie, /Path=\/api\/v1/i);
    });

    test("rejects invalid OTP with 401", async () => {
      mock.method(emailOtpRepository, "findLatestByEmail", async () => ({
        email_otp_id: 1,
        email: "user@example.com",
        otp_hash: hashToken("123456"),
        attempt_count: 0,
        expired_at: new Date(Date.now() + 100000),
        verified_at: null,
      }));
      mock.method(emailOtpRepository, "incrementAttempt", async () => ({}));

      const res = await request(app)
        .post("/api/v1/auth/verify-otp")
        .send({ email: "user@example.com", otp: "000000" });

      assert.equal(res.status, 401);
      assert.equal(res.body.code, "INVALID_OTP");
    });

    test("rejects when OTP attempts exceeded with 429", async () => {
      mock.method(emailOtpRepository, "findLatestByEmail", async () => ({
        email_otp_id: 1,
        email: "user@example.com",
        otp_hash: hashToken("123456"),
        attempt_count: 5,
        expired_at: new Date(Date.now() + 100000),
        verified_at: null,
      }));

      const res = await request(app)
        .post("/api/v1/auth/verify-otp")
        .send({ email: "user@example.com", otp: "123456" });

      assert.equal(res.status, 429);
      assert.equal(res.body.code, "OTP_ATTEMPTS_EXCEEDED");
    });
  });

  // ── POST /auth/refresh ───────────────────────────────────────────────────
  describe("POST /api/v1/auth/refresh", () => {
    test("refreshes token from cookie", async () => {
      const rawRefreshToken = "sample_refresh_token_123";
      mock.method(sessionRepository, "findActiveByHash", async (hash) => {
        if (hash === hashToken(rawRefreshToken)) {
          return { user_session_id: 1, user_id: "00000000-0000-4000-8000-000000000001" };
        }
        return null;
      });
      mock.method(sessionRepository, "revoke", async () => ({}));
      mock.method(sessionRepository, "create", async () => ({ user_session_id: 2 }));

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`refresh_token=${rawRefreshToken}`]);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.access_token);
      assert.equal(res.body.data.refresh_token, undefined);
      assert.match(res.headers["set-cookie"]?.[0] || "", /refresh_token=.*HttpOnly/i);
    });

    test("rejects refresh token supplied in JSON body", async () => {
      mock.method(sessionRepository, "findActiveByHash", async () => null);
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refresh_token: "body_token_must_not_be_accepted" });
      assert.equal(res.status, 401);
      assert.equal(res.body.code, "REFRESH_TOKEN_REQUIRED");
    });

    test("returns 401 when refresh token missing", async () => {
      const res = await request(app).post("/api/v1/auth/refresh");
      assert.equal(res.status, 401);
      assert.equal(res.body.code, "REFRESH_TOKEN_REQUIRED");
    });
  });

  // ── POST /auth/logout & GET /auth/me ─────────────────────────────────────
  describe("Logout and me endpoints", () => {
    test("logout revokes session and clears cookie", async () => {
      mock.method(sessionRepository, "revokeByHash", async () => ({}));

      const res = await request(app)
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${validUserToken}`)
        .set("Cookie", ["refresh_token=tok123"]);

      assert.equal(res.status, 200);
      assert.equal(res.body.code, "LOGGED_OUT");
    });

    test("logout ignores refresh token supplied in JSON body", async () => {
      let revokeCalls = 0;
      mock.method(sessionRepository, "revokeByHash", async () => {
        revokeCalls += 1;
        return {};
      });

      const res = await request(app)
        .post("/api/v1/auth/logout")
        .send({ refresh_token: "body_token_must_not_be_accepted" });

      assert.equal(res.status, 200);
      assert.equal(revokeCalls, 0);
    });

    test("GET /auth/me returns current user identity", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${validUserToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.user_id, "00000000-0000-4000-8000-000000000001");
      assert.equal(res.body.data.email, "user@example.com");
    });

    test("GET /auth/me rejects unauthenticated request", async () => {
      const res = await request(app).get("/api/v1/auth/me");
      assert.equal(res.status, 401);
      assert.equal(res.body.code, "AUTH_REQUIRED");
    });
  });
});
