import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { emailOtpRepository } from "../../../src/repositories/email-otp.repository.js";

describe("email-otp repository", () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: mock.fn(async () => ({ rows: [], rowCount: 0 })),
      release: mock.fn(),
    };
    mock.method(pool, "connect", async () => mockClient);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // ── create ───────────────────────────────────────────────────────────────
  describe("create", () => {
    test("inserts new email_otp and returns row", async () => {
      const record = {
        email_otp_id: 1,
        email: "user@example.com",
        otp_hash: "hash123",
        attempt_count: 0,
        expired_at: new Date(Date.now() + 300000),
        verified_at: null,
        created_at: new Date(),
      };
      mockClient.query = mock.fn(async () => ({ rows: [record], rowCount: 1 }));
      const result = await emailOtpRepository.create({
        email: "user@example.com",
        otpHash: "hash123",
        expiredAt: record.expired_at,
      }, mockClient);

      assert.ok(result);
      assert.equal(result.email, "user@example.com");
      assert.equal(result.otp_hash, "hash123");
    });
  });

  // ── findLatestByEmail ────────────────────────────────────────────────────
  describe("findLatestByEmail", () => {
    test("returns latest unverified OTP record", async () => {
      const record = {
        email_otp_id: 2,
        email: "user@example.com",
        otp_hash: "hash456",
        attempt_count: 1,
        verified_at: null,
      };
      mockClient.query = mock.fn(async () => ({ rows: [record], rowCount: 1 }));
      const result = await emailOtpRepository.findLatestByEmail("user@example.com", mockClient);

      assert.ok(result);
      assert.equal(result.email_otp_id, 2);
    });

    test("returns null if no record found", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await emailOtpRepository.findLatestByEmail("unknown@example.com", mockClient);
      assert.equal(result, null);
    });
  });

  // ── findRecentByEmail ────────────────────────────────────────────────────
  describe("findRecentByEmail", () => {
    test("returns recent OTP within specified seconds window", async () => {
      const record = { email_otp_id: 3, email: "user@example.com" };
      mockClient.query = mock.fn(async () => ({ rows: [record], rowCount: 1 }));
      const result = await emailOtpRepository.findRecentByEmail("user@example.com", 60, mockClient);

      assert.ok(result);
      assert.equal(result.email_otp_id, 3);
    });
  });

  // ── incrementAttempt ─────────────────────────────────────────────────────
  describe("incrementAttempt", () => {
    test("increments attempt_count by 1", async () => {
      mockClient.query = mock.fn(async () => ({
        rows: [{ email_otp_id: 1, attempt_count: 2 }],
        rowCount: 1,
      }));
      const result = await emailOtpRepository.incrementAttempt(1, mockClient);
      assert.ok(result);
      assert.equal(result.attempt_count, 2);
    });
  });

  // ── markVerified ─────────────────────────────────────────────────────────
  describe("markVerified", () => {
    test("sets verified_at to current timestamp", async () => {
      mockClient.query = mock.fn(async () => ({
        rows: [{ email_otp_id: 1, verified_at: new Date() }],
        rowCount: 1,
      }));
      const result = await emailOtpRepository.markVerified(1, mockClient);
      assert.ok(result);
      assert.ok(result.verified_at);
    });
  });
});
