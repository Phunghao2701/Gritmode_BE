import { describe, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { requireAuth, requireRole, createAuthenticate, verifyToken } from "../../../src/middlewares/auth.middleware.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const secret = process.env.JWT_SECRET;

describe("auth middleware", () => {
  test("requireAuth rejects missing or non-bearer header with 401 AUTH_REQUIRED", async () => {
    let err = null;
    await requireAuth({ headers: {} }, {}, (e) => {
      err = e;
    });
    assert.equal(err.statusCode, 401);
    assert.equal(err.code, "AUTH_REQUIRED");

    err = null;
    await requireAuth({ headers: { authorization: "Basic 123" } }, {}, (e) => {
      err = e;
    });
    assert.equal(err.statusCode, 401);
    assert.equal(err.code, "AUTH_REQUIRED");
  });

  test("requireAuth rejects invalid or expired JWT token with 401 TOKEN_INVALID", async () => {
    let err = null;
    await requireAuth({ headers: { authorization: "Bearer invalid-token" } }, {}, (e) => {
      err = e;
    });
    assert.equal(err.statusCode, 401);
    assert.equal(err.code, "TOKEN_INVALID");
  });

  test("requireRole enforces role access", () => {
    const adminOnly = requireRole("admin");

    let err = null;
    adminOnly({ user: { role: "customer" } }, {}, (e) => {
      err = e;
    });
    assert.equal(err.statusCode, 403);
    assert.equal(err.code, "FORBIDDEN_ROLE");

    let passed = false;
    adminOnly({ user: { role: "admin" } }, {}, (e) => {
      passed = !e;
    });
    assert.equal(passed, true);
  });

  test("verifyToken is an alias for requireAuth", () => {
    assert.equal(verifyToken, requireAuth);
  });

  test("createAuthenticate factory verifies tokens and populates req.user", async () => {
    const validToken = jwt.sign({ role: "customer", session_id: 55 }, secret, { subject: "u123" });
    const authMiddleware = createAuthenticate({
      secret,
      users: {
        findById: async (id) => (id === "u123" ? { user_id: "u123", email: "a@b.com", role: "customer", status: "active" } : null),
      },
    });

    const req = { headers: { authorization: `Bearer ${validToken}` } };
    let passed = false;
    await authMiddleware(req, {}, (e) => {
      passed = !e;
    });
    assert.equal(passed, true);
    assert.equal(req.user.user_id, "u123");
    assert.equal(req.user.session_id, 55);

    // Missing header
    let err = null;
    await authMiddleware({ headers: {} }, {}, (e) => {
      err = e;
    });
    assert.equal(err.statusCode, 401);

    // Inactive user
    const inactiveAuthMiddleware = createAuthenticate({
      secret,
      users: {
        findById: async () => ({ user_id: "u123", email: "a@b.com", role: "customer", status: "blocked" }),
      },
    });
    err = null;
    await inactiveAuthMiddleware({ headers: { authorization: `Bearer ${validToken}` } }, {}, (e) => {
      err = e;
    });
    assert.equal(err.statusCode, 403);
    assert.equal(err.code, "ACCOUNT_UNAVAILABLE");

    // Missing user
    const missingUserAuthMiddleware = createAuthenticate({
      secret,
      users: { findById: async () => null },
    });
    err = null;
    await missingUserAuthMiddleware({ headers: { authorization: `Bearer ${validToken}` } }, {}, (e) => {
      err = e;
    });
    assert.equal(err.statusCode, 401);
    assert.equal(err.code, "TOKEN_INVALID");
  });
});
