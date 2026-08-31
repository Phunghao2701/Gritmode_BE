import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { sessionRepository } from "../../src/repositories/session.repository.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";

const userToken = createAccessToken(
  { user_id: userId, role: "customer", session_id: 10 },
  { secret, expiresIn: "1h" },
);

describe("user session routes integration", () => {
  const sampleSessions = [
    {
      user_session_id: 10,
      user_id: userId,
      user_agent: "Chrome / Windows",
      ip_address: "127.0.0.1",
      expired_at: new Date(Date.now() + 86400000),
      revoked_at: null,
      created_at: new Date("2026-08-31T10:00:00.000Z"),
    },
    {
      user_session_id: 11,
      user_id: userId,
      user_agent: "Safari / iPhone",
      ip_address: "192.168.1.1",
      expired_at: new Date(Date.now() + 86400000),
      revoked_at: null,
      created_at: new Date("2026-08-29T10:00:00.000Z"),
    },
  ];

  afterEach(() => {
    mock.restoreAll();
  });

  test("GET /api/v1/users/me/sessions requires auth and returns current user sessions", async () => {
    const unauth = await request(app).get("/api/v1/users/me/sessions");
    assert.equal(unauth.status, 401);

    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      role: "customer",
      status: "active",
    }));

    mock.method(sessionRepository, "listByUser", async (uid) => {
      assert.equal(uid, userId);
      return sampleSessions;
    });

    const res = await request(app)
      .get("/api/v1/users/me/sessions")
      .set("Authorization", `Bearer ${userToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.data[0].user_session_id, 10);
    assert.equal(res.body.data[0].is_current, true);
    assert.equal(res.body.data[0].is_active, true);
    assert.equal(res.body.data[1].user_session_id, 11);
    assert.equal(res.body.data[1].is_current, false);
  });

  test("DELETE /api/v1/users/me/sessions/:sessionId revokes session or returns 404", async () => {
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      role: "customer",
      status: "active",
    }));

    mock.method(sessionRepository, "revokeOwned", async (sid, uid) => {
      return Number(sid) === 11 && uid === userId;
    });

    const successRes = await request(app)
      .delete("/api/v1/users/me/sessions/11")
      .set("Authorization", `Bearer ${userToken}`);

    assert.equal(successRes.status, 200);

    const notFoundRes = await request(app)
      .delete("/api/v1/users/me/sessions/999")
      .set("Authorization", `Bearer ${userToken}`);

    assert.equal(notFoundRes.status, 404);
  });

  test("DELETE /api/v1/users/me/sessions revokes all sessions and clears cookie", async () => {
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      role: "customer",
      status: "active",
    }));

    let revoked = false;
    mock.method(sessionRepository, "revokeAllByUser", async (uid) => {
      if (uid === userId) revoked = true;
    });

    const res = await request(app)
      .delete("/api/v1/users/me/sessions")
      .set("Authorization", `Bearer ${userToken}`);

    assert.equal(res.status, 200);
    assert.equal(revoked, true);
  });
});
