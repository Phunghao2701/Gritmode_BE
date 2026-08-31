import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createUserSessionService } from "../../../src/services/user-session.service.js";

describe("user session service", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const otherUserId = "00000000-0000-4000-8000-000000000002";

  const sampleSession1 = {
    user_session_id: 1,
    user_id: userId,
    refresh_token_hash: "hash123",
    user_agent: "Chrome / Windows",
    ip_address: "127.0.0.1",
    expired_at: new Date(Date.now() + 86400000),
    revoked_at: null,
    created_at: new Date("2026-08-30T10:00:00.000Z"),
  };

  const sampleSession2 = {
    user_session_id: 2,
    user_id: userId,
    refresh_token_hash: "hash456",
    user_agent: "Safari / iPhone",
    ip_address: "192.168.1.1",
    expired_at: new Date(Date.now() - 86400000), // expired
    revoked_at: null,
    created_at: new Date("2026-08-28T10:00:00.000Z"),
  };

  const sampleSession3 = {
    user_session_id: 3,
    user_id: userId,
    refresh_token_hash: "hash789",
    user_agent: "Firefox / Linux",
    ip_address: "10.0.0.1",
    expired_at: new Date(Date.now() + 86400000),
    revoked_at: new Date("2026-08-29T10:00:00.000Z"), // revoked
    created_at: new Date("2026-08-27T10:00:00.000Z"),
  };

  test("getUserSessions returns sessions with is_current, is_active, and without token hash", async () => {
    const service = createUserSessionService({
      sessions: {
        listByUser: async (uid) => {
          assert.equal(uid, userId);
          return [sampleSession1, sampleSession2, sampleSession3];
        },
      },
    });

    const result = await service.getUserSessions(userId, 1);
    assert.equal(result.length, 3);

    // Session 1: active and current
    assert.equal(result[0].user_session_id, 1);
    assert.equal(result[0].is_current, true);
    assert.equal(result[0].is_active, true);
    assert.equal(result[0].refresh_token_hash, undefined);

    // Session 2: expired, not current
    assert.equal(result[1].user_session_id, 2);
    assert.equal(result[1].is_current, false);
    assert.equal(result[1].is_active, false);

    // Session 3: revoked, not current
    assert.equal(result[2].user_session_id, 3);
    assert.equal(result[2].is_current, false);
    assert.equal(result[2].is_active, false);
  });

  test("getUserSessionById returns session detail or 404 for missing/foreign session", async () => {
    const service = createUserSessionService({
      sessions: {
        findById: async (id) => {
          if (id === 1) return sampleSession1;
          if (id === 99) return { ...sampleSession1, user_session_id: 99, user_id: otherUserId };
          return null;
        },
      },
    });

    const session = await service.getUserSessionById(userId, 1, 1);
    assert.equal(session.user_session_id, 1);
    assert.equal(session.is_current, true);
    assert.equal(session.refresh_token_hash, undefined);

    // Not found
    await assert.rejects(
      () => service.getUserSessionById(userId, 999),
      (err) => err.statusCode === 404 && err.code === "SESSION_NOT_FOUND",
    );

    // Belongs to another user -> 404
    await assert.rejects(
      () => service.getUserSessionById(userId, 99),
      (err) => err.statusCode === 404 && err.code === "SESSION_NOT_FOUND",
    );
  });

  test("createUserSession delegates to repository", async () => {
    let captured = null;
    const service = createUserSessionService({
      sessions: {
        create: async (data) => {
          captured = data;
          return { user_session_id: 10, ...data };
        },
      },
    });

    const created = await service.createUserSession({
      userId,
      refreshTokenHash: "hash123",
      userAgent: "Agent",
      ipAddress: "127.0.0.1",
      expiresAt: new Date(),
    });

    assert.equal(created.user_session_id, 10);
    assert.equal(captured.userId, userId);
  });

  test("findSessionByRefreshToken hashes token and finds active session", async () => {
    let capturedHash = null;
    const service = createUserSessionService({
      sessions: {
        findActiveByHash: async (hash) => {
          capturedHash = hash;
          return sampleSession1;
        },
      },
    });

    const session = await service.findSessionByRefreshToken("raw-refresh-token");
    assert.ok(session);
    assert.ok(capturedHash);
  });

  test("revokeSession revokes owned session or throws 404", async () => {
    const service = createUserSessionService({
      sessions: {
        revokeOwned: async (sessionId, uid) => {
          return sessionId === 1 && uid === userId;
        },
      },
    });

    await service.revokeSession(userId, 1);

    await assert.rejects(
      () => service.revokeSession(userId, 999),
      (err) => err.statusCode === 404 && err.code === "SESSION_NOT_FOUND",
    );
  });

  test("revokeAllUserSessions revokes all sessions for user", async () => {
    let revokedUserId = null;
    const service = createUserSessionService({
      sessions: {
        revokeAllByUser: async (uid) => {
          revokedUserId = uid;
        },
      },
    });

    await service.revokeAllUserSessions(userId);
    assert.equal(revokedUserId, userId);
  });

  test("helpers isSessionExpired, isSessionRevoked, isSessionActive", () => {
    const service = createUserSessionService();
    assert.equal(service.isSessionExpired(sampleSession1), false);
    assert.equal(service.isSessionExpired(sampleSession2), true);
    assert.equal(service.isSessionRevoked(sampleSession1), false);
    assert.equal(service.isSessionRevoked(sampleSession3), true);
    assert.equal(service.isSessionActive(sampleSession1), true);
    assert.equal(service.isSessionActive(sampleSession2), false);
    assert.equal(service.isSessionActive(sampleSession3), false);
  });
});
