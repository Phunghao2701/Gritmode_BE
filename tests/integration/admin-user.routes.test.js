import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { sessionRepository } from "../../src/repositories/session.repository.js";
import { auditRepository } from "../../src/repositories/audit.repository.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const adminToken = createAccessToken(
  { user_id: "00000000-0000-4000-8000-000000000001", role: "admin", session_id: 1 },
  { secret, expiresIn: "1h" },
);
const customerToken = createAccessToken(
  { user_id: "00000000-0000-4000-8000-000000000002", role: "customer", session_id: 2 },
  { secret, expiresIn: "1h" },
);

describe("admin user routes HTTP contract", () => {
  const customerId = "00000000-0000-4000-8000-000000000002";
  const sampleCustomer = {
    user_id: customerId,
    email: "customer@example.com",
    role: "customer",
    status: "active",
    full_name: "Customer A",
  };

  beforeEach(() => {
    mock.method(pool, "connect", async () => ({
      query: async () => ({ rows: [], rowCount: 1 }),
      release: () => {},
    }));
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      email: id === "00000000-0000-4000-8000-000000000001" ? "admin@example.com" : "customer@example.com",
      role: id === "00000000-0000-4000-8000-000000000001" ? "admin" : "customer",
      status: "active",
    }));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test("GET /api/v1/admin/users requires admin role", async () => {
    const unauth = await request(app).get("/api/v1/admin/users");
    assert.equal(unauth.status, 401);

    const forbidden = await request(app)
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${customerToken}`);
    assert.equal(forbidden.status, 403);
  });

  test("GET /api/v1/admin/users returns paginated user list", async () => {
    mock.method(userRepository, "countAdminUsers", async () => 1);
    mock.method(userRepository, "findAdminUsers", async () => [sampleCustomer]);

    const res = await request(app)
      .get("/api/v1/admin/users?page=1&limit=20&search=customer&role=customer&status=active")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.items.length, 1);
    assert.equal(res.body.data.pagination.total, 1);
  });

  test("GET /api/v1/admin/users/:userId returns user detail", async () => {
    mock.method(userRepository, "findById", async (id) => {
      if (id === "00000000-0000-4000-8000-000000000001") {
        return { user_id: id, role: "admin", status: "active" };
      }
      return sampleCustomer;
    });

    const res = await request(app)
      .get(`/api/v1/admin/users/${customerId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user_id, customerId);
  });

  test("PATCH /api/v1/admin/users/:userId/block blocks user", async () => {
    mock.method(userRepository, "lockUserById", async () => sampleCustomer);
    mock.method(userRepository, "countActiveAdmins", async () => 2);
    mock.method(userRepository, "updateUserStatus", async (id, st) => ({ ...sampleCustomer, status: st }));
    mock.method(sessionRepository, "revokeAllByUserId", async () => 1);
    mock.method(auditRepository, "log", async () => ({}));

    const res = await request(app)
      .patch(`/api/v1/admin/users/${customerId}/block`)
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "blocked");
  });

  test("PATCH /api/v1/admin/users/:userId/unblock unblocks user", async () => {
    mock.method(userRepository, "lockUserById", async () => ({ ...sampleCustomer, status: "blocked" }));
    mock.method(userRepository, "updateUserStatus", async (id, st) => ({ ...sampleCustomer, status: st }));
    mock.method(auditRepository, "log", async () => ({}));

    const res = await request(app)
      .patch(`/api/v1/admin/users/${customerId}/unblock`)
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "active");
  });

  test("PATCH /api/v1/admin/users/:userId/inactive sets user inactive", async () => {
    mock.method(userRepository, "lockUserById", async () => sampleCustomer);
    mock.method(userRepository, "countActiveAdmins", async () => 2);
    mock.method(userRepository, "updateUserStatus", async (id, st) => ({ ...sampleCustomer, status: st }));
    mock.method(sessionRepository, "revokeAllByUserId", async () => 1);
    mock.method(auditRepository, "log", async () => ({}));

    const res = await request(app)
      .patch(`/api/v1/admin/users/${customerId}/inactive`)
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "inactive");
  });
});
