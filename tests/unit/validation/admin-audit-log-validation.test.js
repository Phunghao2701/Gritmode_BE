import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAuditLogId,
  validateAuditLogQuery,
} from "../../../src/utils/validation.js";

describe("admin audit log validation primitives", () => {
  describe("validateAuditLogId", () => {
    test("accepts valid positive integer ID", () => {
      assert.equal(validateAuditLogId("123"), 123);
      assert.equal(validateAuditLogId(456), 456);
    });

    test("rejects non-positive, zero or invalid IDs", () => {
      assert.throws(() => validateAuditLogId("0"));
      assert.throws(() => validateAuditLogId("-5"));
      assert.throws(() => validateAuditLogId("abc"));
      assert.throws(() => validateAuditLogId(null));
      assert.throws(() => validateAuditLogId(undefined));
    });
  });

  describe("validateAuditLogQuery", () => {
    test("returns defaults for empty query", () => {
      const res = validateAuditLogQuery({});
      assert.equal(res.ok, true);
      assert.equal(res.value.page, 1);
      assert.equal(res.value.limit, 20);
      assert.equal(res.value.sort_order, "DESC");
    });

    test("accepts valid query parameters", () => {
      const res = validateAuditLogQuery({
        page: "2",
        limit: "50",
        search: "ORDER",
        action: "ORDER_CONFIRMED",
        entity: "order",
        entity_id: "1001",
        admin_user_id: "00000000-0000-4000-8000-000000000001",
        from_date: "2026-08-01T00:00:00.000Z",
        to_date: "2026-08-31T23:59:59.000Z",
        sort_order: "ASC",
      });

      assert.equal(res.ok, true);
      assert.equal(res.value.page, 2);
      assert.equal(res.value.limit, 50);
      assert.equal(res.value.search, "ORDER");
      assert.equal(res.value.action, "ORDER_CONFIRMED");
      assert.equal(res.value.entity, "order");
      assert.equal(res.value.entity_id, "1001");
      assert.equal(res.value.admin_user_id, "00000000-0000-4000-8000-000000000001");
      assert.equal(res.value.from_date, "2026-08-01T00:00:00.000Z");
      assert.equal(res.value.to_date, "2026-08-31T23:59:59.000Z");
      assert.equal(res.value.sort_order, "ASC");
    });

    test("rejects invalid page, limit, UUID, date bounds, or sort_order", () => {
      assert.equal(validateAuditLogQuery(null).ok, false);
      assert.equal(validateAuditLogQuery("not-an-object").ok, false);
      assert.equal(validateAuditLogQuery({ page: "0" }).ok, false);
      assert.equal(validateAuditLogQuery({ limit: "150" }).ok, false);
      assert.equal(validateAuditLogQuery({ search: "a".repeat(256) }).ok, false);
      assert.equal(validateAuditLogQuery({ action: "a".repeat(101) }).ok, false);
      assert.equal(validateAuditLogQuery({ entity: "a".repeat(101) }).ok, false);
      assert.equal(validateAuditLogQuery({ entity_id: "a".repeat(101) }).ok, false);
      assert.equal(validateAuditLogQuery({ admin_user_id: "not-a-uuid" }).ok, false);
      assert.equal(validateAuditLogQuery({ from_date: "invalid-date" }).ok, false);
      assert.equal(validateAuditLogQuery({ to_date: "invalid-date" }).ok, false);
      assert.equal(
        validateAuditLogQuery({
          from_date: "2026-08-31T00:00:00.000Z",
          to_date: "2026-08-01T00:00:00.000Z",
        }).ok,
        false,
      );
      assert.equal(validateAuditLogQuery({ sort_order: "INVALID" }).ok, false);
    });
  });
});
