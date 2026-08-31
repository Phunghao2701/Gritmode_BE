import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateAdminUserQuery } from "../../../src/utils/validation.js";

describe("admin user validation primitives", () => {
  describe("validateAdminUserQuery", () => {
    test("accepts default empty query and returns default values", () => {
      const res = validateAdminUserQuery({});
      assert.ok(res.ok);
      assert.equal(res.value.page, 1);
      assert.equal(res.value.limit, 20);
      assert.equal(res.value.search, undefined);
      assert.equal(res.value.role, undefined);
      assert.equal(res.value.status, undefined);
      assert.equal(res.value.sort_by, "created_at");
      assert.equal(res.value.sort_order, "DESC");
    });

    test("accepts valid query parameters", () => {
      const res = validateAdminUserQuery({
        page: "2",
        limit: "50",
        search: "customer@example.com",
        role: "customer",
        status: "blocked",
        sort_by: "email",
        sort_order: "asc",
      });
      assert.ok(res.ok);
      assert.equal(res.value.page, 2);
      assert.equal(res.value.limit, 50);
      assert.equal(res.value.search, "customer@example.com");
      assert.equal(res.value.role, "customer");
      assert.equal(res.value.status, "blocked");
      assert.equal(res.value.sort_by, "email");
      assert.equal(res.value.sort_order, "ASC");
    });

    test("rejects invalid page, limit, role, status or sort_by", () => {
      assert.ok(!validateAdminUserQuery({ page: 0 }).ok);
      assert.ok(!validateAdminUserQuery({ limit: 101 }).ok);
      assert.ok(!validateAdminUserQuery({ role: "superadmin" }).ok);
      assert.ok(!validateAdminUserQuery({ status: "deleted" }).ok);
      assert.ok(!validateAdminUserQuery({ sort_by: "password" }).ok);
    });
  });
});
