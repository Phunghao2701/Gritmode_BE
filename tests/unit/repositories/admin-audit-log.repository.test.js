import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { auditRepository } from "../../../src/repositories/audit.repository.js";

describe("audit repository methods", () => {
  const sampleLog = {
    audit_log_id: 1,
    user_id: "00000000-0000-4000-8000-000000000001",
    action: "ORDER_CONFIRMED",
    entity_name: "order",
    entity_id: "1001",
    old_data: { status_order: "pending" },
    new_data: { status_order: "confirmed" },
    created_at: new Date(),
    admin_email: "admin@example.com",
    admin_full_name: "Admin User",
  };

  test("findAuditLogs and countAuditLogs query database with filters and joins", async () => {
    const mockClient = {
      query: mock.fn(async (sql) => {
        if (sql.includes("COUNT(")) {
          return { rows: [{ total: 1 }], rowCount: 1 };
        }
        return { rows: [sampleLog], rowCount: 1 };
      }),
    };

    const count = await auditRepository.countAuditLogs(
      {
        search: "ORDER",
        action: "ORDER_CONFIRMED",
        entity: "order",
        entity_id: "1001",
        admin_user_id: "00000000-0000-4000-8000-000000000001",
        from_date: "2026-08-01",
        to_date: "2026-08-31",
      },
      mockClient,
    );

    const items = await auditRepository.findAuditLogs(
      {
        page: 1,
        limit: 20,
        search: "ORDER",
        action: "ORDER_CONFIRMED",
        entity: "order",
        entity_id: "1001",
        admin_user_id: "00000000-0000-4000-8000-000000000001",
        from_date: "2026-08-01",
        to_date: "2026-08-31",
        sort_order: "DESC",
      },
      mockClient,
    );

    assert.equal(count, 1);
    assert.equal(items.length, 1);
    assert.equal(items[0].action, "ORDER_CONFIRMED");
    assert.equal(items[0].admin_email, "admin@example.com");
  });

  test("findById returns single audit log record", async () => {
    const mockClient = {
      query: mock.fn(async () => ({ rows: [sampleLog], rowCount: 1 })),
    };

    const log = await auditRepository.findById(1, mockClient);
    assert.ok(log);
    assert.equal(log.audit_log_id, 1);
    assert.equal(log.entity_name, "order");
  });

  test("log and record create audit entries", async () => {
    const mockClient = {
      query: mock.fn(async () => ({ rows: [sampleLog], rowCount: 1 })),
    };

    const inserted1 = await auditRepository.log(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        action: "ORDER_CONFIRMED",
        entityName: "order",
        entityId: "1001",
        oldData: { status_order: "pending" },
        newData: { status_order: "confirmed" },
      },
      mockClient,
    );
    assert.ok(inserted1);

    const inserted2 = await auditRepository.record(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        action: "ORDER_CONFIRMED",
        entity: "order",
        entityId: "1001",
      },
      mockClient,
    );
    assert.ok(inserted2);

    const insertSql = mockClient.query.mock.calls[0].arguments[0];
    assert.match(insertSql, /action_admin_audit_log/);
    assert.match(insertSql, /entity_admin_audit_log/);
    assert.match(insertSql, /entity_id_admin_audit_log/);
    assert.doesNotMatch(insertSql, /\(user_id, action, entity_name, entity_id,/);
  });
});
