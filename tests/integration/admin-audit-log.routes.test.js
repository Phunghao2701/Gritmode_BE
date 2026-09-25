import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { auditRepository } from "../../src/repositories/audit.repository.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const adminId = "00000000-0000-4000-8000-000000000001";
const customerId = "00000000-0000-4000-8000-000000000002";

const adminToken = createAccessToken(
  { user_id: adminId, role: "admin", session_id: 1 },
  { secret, expiresIn: "1h" },
);

const customerToken = createAccessToken(
  { user_id: customerId, role: "customer", session_id: 2 },
  { secret, expiresIn: "1h" },
);

describe("admin audit log routes integration", () => {
  const sampleLog = {
    audit_log_id: 101,
    user_id: adminId,
    action: "ORDER_CONFIRMED",
    entity_name: "order",
    entity_id: "1001",
    old_data: { status_order: "pending" },
    new_data: { status_order: "confirmed" },
    created_at: new Date("2026-08-31T10:00:00.000Z"),
    admin_email: "admin@example.com",
    admin_full_name: "Admin User",
  };

  afterEach(() => {
    mock.restoreAll();
  });

  test("GET /api/v1/admin/audit-logs requires auth and admin role", async () => {
    const unauth = await request(app).get("/api/v1/admin/audit-logs");
    assert.equal(unauth.status, 401);

    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      role: "customer",
      status: "active",
    }));

    const forbidden = await request(app)
      .get("/api/v1/admin/audit-logs")
      .set("Authorization", `Bearer ${customerToken}`);
    assert.equal(forbidden.status, 403);
  });

  test("GET /api/v1/admin/audit-logs returns list with filters and pagination", async () => {
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      role: "admin",
      status: "active",
    }));

    mock.method(auditRepository, "countAuditLogs", async () => 1);
    mock.method(auditRepository, "findAuditLogs", async () => [sampleLog]);

    const res = await request(app)
      .get("/api/v1/admin/audit-logs?page=1&limit=20&search=ORDER&entity=order")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.pagination.total, 1);
    assert.equal(res.body.data.items.length, 1);
    assert.equal(res.body.data.items[0].admin_audit_log_id, 101);
    assert.equal(res.body.data.items[0].action_admin_audit_log, "ORDER_CONFIRMED");
  });

  test("GET /api/v1/admin/audit-logs/:auditLogId returns detail or 404", async () => {
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      role: "admin",
      status: "active",
    }));

    mock.method(auditRepository, "findById", async (id) => {
      if (Number(id) === 101) return sampleLog;
      return null;
    });

    const successRes = await request(app)
      .get("/api/v1/admin/audit-logs/101")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(successRes.status, 200);
    assert.equal(successRes.body.data.admin_audit_log_id, 101);

    const notFoundRes = await request(app)
      .get("/api/v1/admin/audit-logs/999")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(notFoundRes.status, 404);
  });
});
