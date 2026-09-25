import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createAdminAuditLogService } from "../../../src/services/admin-audit-log.service.js";

describe("admin audit log service", () => {
  const sampleRawLog = {
    audit_log_id: 1,
    user_id: "00000000-0000-4000-8000-000000000001",
    action: "ORDER_CONFIRMED",
    entity_name: "order",
    entity_id: "1001",
    old_data: { status_order: "pending" },
    new_data: { status_order: "confirmed" },
    created_at: new Date("2026-08-31T10:00:00.000Z"),
    admin_email: "admin@example.com",
    admin_full_name: "Admin User",
  };

  test("getAuditLogs returns mapped items and pagination", async () => {
    const service = createAdminAuditLogService({
      audits: {
        countAuditLogs: async () => 1,
        findAuditLogs: async () => [sampleRawLog],
      },
    });

    const res = await service.getAuditLogs({ page: 1, limit: 20 });
    assert.equal(res.pagination.total, 1);
    assert.equal(res.items.length, 1);

    const item = res.items[0];
    assert.equal(item.admin_audit_log_id, 1);
    assert.equal(item.action_admin_audit_log, "ORDER_CONFIRMED");
    assert.equal(item.entity_admin_audit_log, "order");
    assert.equal(item.entity_id_admin_audit_log, "1001");
    assert.deepEqual(item.admin, {
      user_id: "00000000-0000-4000-8000-000000000001",
      email: "admin@example.com",
      full_name: "Admin User",
    });
  });

  test("getAuditLogById returns single mapped item and throws 404 when not found", async () => {
    const service = createAdminAuditLogService({
      audits: {
        findById: async (id) => (id === 1 ? sampleRawLog : null),
      },
    });

    const item = await service.getAuditLogById(1);
    assert.equal(item.admin_audit_log_id, 1);
    assert.equal(item.entity_admin_audit_log, "order");

    await assert.rejects(
      () => service.getAuditLogById(999),
      (err) => err.statusCode === 404 && err.code === "AUDIT_LOG_NOT_FOUND",
    );
  });

  test("createAuditLog delegates to audit repository", async () => {
    let captured = null;
    const service = createAdminAuditLogService({
      audits: {
        log: async (payload) => {
          captured = payload;
          return sampleRawLog;
        },
      },
    });

    await service.createAuditLog({
      adminUserId: "00000000-0000-4000-8000-000000000001",
      action: "ORDER_CONFIRMED",
      entity: "order",
      entityId: "1001",
      oldData: { status_order: "pending" },
      newData: { status_order: "confirmed" },
    });

    assert.ok(captured);
    assert.equal(captured.action, "ORDER_CONFIRMED");

    await service.createAuditLog({
      userId: "00000000-0000-4000-8000-000000000002",
      action: "USER_BLOCKED",
      entityName: "user",
      entityId: 2,
    });
    assert.equal(captured.userId, "00000000-0000-4000-8000-000000000002");
    assert.equal(captured.entityName, "user");
  });

  test("formatAuditLog handles null, json string parsing, missing admin user and entity variations", async () => {
    const { formatAuditLog } = await import("../../../src/services/admin-audit-log.service.js");

    assert.equal(formatAuditLog(null), null);

    const logWithoutUser = formatAuditLog({
      admin_audit_log_id: 202,
      user_id: null,
      action_admin_audit_log: "INVENTORY_UPDATED",
      entity: "inventory",
      entity_id: null,
      old_data: JSON.stringify({ stock: 10 }),
      new_data: "plain string not json",
      created_at: new Date(),
    });

    assert.equal(logWithoutUser.admin_audit_log_id, 202);
    assert.equal(logWithoutUser.admin, null);
    assert.deepEqual(logWithoutUser.old_data, { stock: 10 });
    assert.equal(logWithoutUser.new_data, "plain string not json");
    assert.equal(logWithoutUser.entity_id_admin_audit_log, null);
  });
});

