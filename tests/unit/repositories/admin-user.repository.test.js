import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { userRepository } from "../../../src/repositories/user.repository.js";
import { sessionRepository } from "../../../src/repositories/session.repository.js";

describe("admin user repository methods", () => {
  const mockClient = {
    query: async () => ({ rows: [], rowCount: 0 }),
    release: () => {},
  };

  test("findAdminUsers and countAdminUsers query users with filters", async () => {
    const userRow = {
      user_id: "00000000-0000-4000-8000-000000000001",
      email: "user@example.com",
      status: "active",
      role: "customer",
    };
    mockClient.query = mock.fn(async (sql) => {
      if (sql.includes("COUNT(")) {
        return { rows: [{ total: 1 }], rowCount: 1 };
      }
      return { rows: [userRow], rowCount: 1 };
    });

    const count = await userRepository.countAdminUsers({ search: "user", role: "customer", status: "active" }, mockClient);
    const users = await userRepository.findAdminUsers({ page: 1, limit: 20, search: "user", role: "customer", status: "active" }, mockClient);

    assert.equal(count, 1);
    assert.equal(users.length, 1);
    assert.equal(users[0].email, "user@example.com");
  });

  test("lockUserById and updateUserStatus", async () => {
    const userRow = {
      user_id: "00000000-0000-4000-8000-000000000001",
      email: "user@example.com",
      status: "blocked",
      role: "customer",
    };
    mockClient.query = mock.fn(async () => ({ rows: [userRow], rowCount: 1 }));

    const locked = await userRepository.lockUserById("00000000-0000-4000-8000-000000000001", mockClient);
    assert.ok(locked);
    assert.equal(locked.user_id, "00000000-0000-4000-8000-000000000001");

    const updated = await userRepository.updateUserStatus("00000000-0000-4000-8000-000000000001", "blocked", mockClient);
    assert.ok(updated);
    assert.equal(updated.status, "blocked");
  });

  test("countActiveAdmins and revokeAllByUserId", async () => {
    mockClient.query = mock.fn(async () => ({ rows: [{ count: 2 }], rowCount: 1 }));

    const activeAdmins = await userRepository.countActiveAdmins(mockClient);
    assert.equal(activeAdmins, 2);

    mockClient.query = mock.fn(async () => ({ rows: [], rowCount: 3 }));
    const revoked = await sessionRepository.revokeAllByUserId("00000000-0000-4000-8000-000000000001", mockClient);
    assert.equal(revoked, 3);
  });
});
