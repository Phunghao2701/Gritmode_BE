import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createAdminUserService } from "../../../src/services/admin-user.service.js";

describe("admin user service", () => {
  const adminId = "00000000-0000-4000-8000-000000000001";
  const customerId = "00000000-0000-4000-8000-000000000002";

  const sampleCustomer = {
    user_id: customerId,
    email: "customer@example.com",
    role: "customer",
    status: "active",
    full_name: "Customer A",
  };

  test("getUsers returns items and pagination", async () => {
    const service = createAdminUserService({
      users: {
        countAdminUsers: async () => 1,
        findAdminUsers: async () => [sampleCustomer],
      },
    });

    const res = await service.getUsers({ page: 1, limit: 20 });
    assert.equal(res.pagination.total, 1);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].email, "customer@example.com");
  });

  test("getUserById returns sanitized user detail and throws 404 when not found", async () => {
    const service = createAdminUserService({
      users: {
        findById: async (id) => (id === customerId ? sampleCustomer : null),
      },
    });

    const res = await service.getUserById(customerId);
    assert.equal(res.user_id, customerId);

    await assert.rejects(
      () => service.getUserById("00000000-0000-4000-8000-000000000999"),
      (err) => err.statusCode === 404 && err.code === "USER_NOT_FOUND",
    );
  });

  test("blockUser updates status to blocked, revokes sessions, logs audit", async () => {
    let statusUpdated = null;
    let sessionsRevoked = false;
    let auditLogged = null;

    const service = createAdminUserService({
      users: {
        lockUserById: async () => ({ ...sampleCustomer, status: "active" }),
        updateUserStatus: async (id, st) => {
          statusUpdated = st;
          return { ...sampleCustomer, status: st };
        },
        countActiveAdmins: async () => 2,
      },
      sessions: {
        revokeAllByUserId: async () => { sessionsRevoked = true; },
      },
      audits: {
        log: async (payload) => { auditLogged = payload; },
      },
      transaction: async (fn) => fn({}),
    });

    const res = await service.blockUser(customerId, adminId);
    assert.equal(res.status, "blocked");
    assert.equal(statusUpdated, "blocked");
    assert.equal(sessionsRevoked, true);
    assert.equal(auditLogged.action, "USER_BLOCKED");
  });

  test("blockUser rejects self-block or last active admin block", async () => {
    const service = createAdminUserService({
      users: {
        lockUserById: async (id) => ({
          user_id: id,
          role: "admin",
          status: "active",
        }),
        countActiveAdmins: async () => 1,
      },
      transaction: async (fn) => fn({}),
    });

    // Self block
    await assert.rejects(
      () => service.blockUser(adminId, adminId),
      (err) => err.statusCode === 409 && err.code === "SELF_ACTION_NOT_ALLOWED",
    );

    // Last admin block
    await assert.rejects(
      () => service.blockUser("other-admin-id", adminId),
      (err) => err.statusCode === 409 && err.code === "LAST_ADMIN_PROTECTED",
    );
  });

  test("unblockUser updates blocked user to active and logs audit", async () => {
    let statusUpdated = null;
    let auditLogged = null;

    const service = createAdminUserService({
      users: {
        lockUserById: async () => ({ ...sampleCustomer, status: "blocked" }),
        updateUserStatus: async (id, st) => {
          statusUpdated = st;
          return { ...sampleCustomer, status: st };
        },
      },
      audits: {
        log: async (payload) => { auditLogged = payload; },
      },
      transaction: async (fn) => fn({}),
    });

    const res = await service.unblockUser(customerId, adminId);
    assert.equal(res.status, "active");
    assert.equal(statusUpdated, "active");
    assert.equal(auditLogged.action, "USER_UNBLOCKED");
  });

  test("unblockUser throws 409 if user is not blocked", async () => {
    const service = createAdminUserService({
      users: {
        lockUserById: async () => ({ ...sampleCustomer, status: "active" }),
      },
      transaction: async (fn) => fn({}),
    });

    await assert.rejects(
      () => service.unblockUser(customerId, adminId),
      (err) => err.statusCode === 409 && err.code === "INVALID_STATUS_TRANSITION",
    );
  });

  test("setUserInactive updates status to inactive, revokes sessions, logs audit", async () => {
    let statusUpdated = null;
    let sessionsRevoked = false;
    let auditLogged = null;

    const service = createAdminUserService({
      users: {
        lockUserById: async () => ({ ...sampleCustomer, status: "active" }),
        updateUserStatus: async (id, st) => {
          statusUpdated = st;
          return { ...sampleCustomer, status: st };
        },
        countActiveAdmins: async () => 2,
      },
      sessions: {
        revokeAllByUserId: async () => { sessionsRevoked = true; },
      },
      audits: {
        log: async (payload) => { auditLogged = payload; },
      },
      transaction: async (fn) => fn({}),
    });

    const res = await service.setUserInactive(customerId, adminId);
    assert.equal(res.status, "inactive");
    assert.equal(statusUpdated, "inactive");
    assert.equal(sessionsRevoked, true);
    assert.equal(auditLogged.action, "USER_SET_INACTIVE");
  });

  test("status transition validation and sanitize helper", () => {
    const service = createAdminUserService();
    assert.equal(service.validateUserStatusTransition("active", "active"), false);
    assert.equal(service.validateUserStatusTransition("active", "blocked"), true);
    assert.equal(service.validateUserStatusTransition("active", "inactive"), true);
    assert.equal(service.validateUserStatusTransition("blocked", "active"), true);
    assert.equal(service.validateUserStatusTransition("blocked", "inactive"), false);
    assert.equal(service.validateUserStatusTransition("unknown", "active"), false);
  });

  test("blockUser and unblockUser error branches", async () => {
    // blockUser target not found
    const notFoundService = createAdminUserService({
      users: { lockUserById: async () => null },
      transaction: async (fn) => fn({}),
    });
    await assert.rejects(
      () => notFoundService.blockUser(customerId, adminId),
      (err) => err.statusCode === 404 && err.code === "USER_NOT_FOUND",
    );

    // blockUser invalid transition
    const invalidTransService = createAdminUserService({
      users: { lockUserById: async () => ({ ...sampleCustomer, status: "blocked" }) },
      transaction: async (fn) => fn({}),
    });
    await assert.rejects(
      () => invalidTransService.blockUser(customerId, adminId),
      (err) => err.statusCode === 409 && err.code === "INVALID_STATUS_TRANSITION",
    );

    // unblockUser target not found
    await assert.rejects(
      () => notFoundService.unblockUser(customerId, adminId),
      (err) => err.statusCode === 404 && err.code === "USER_NOT_FOUND",
    );
  });

  test("setUserInactive error branches", async () => {
    const service = createAdminUserService({
      users: {
        lockUserById: async (id) => (id === "last-admin" ? { user_id: "last-admin", role: "admin", status: "active" } : null),
        countActiveAdmins: async () => 1,
      },
      transaction: async (fn) => fn({}),
    });

    // Self action
    await assert.rejects(
      () => service.setUserInactive(adminId, adminId),
      (err) => err.statusCode === 409 && err.code === "SELF_ACTION_NOT_ALLOWED",
    );

    // Target not found
    await assert.rejects(
      () => service.setUserInactive("missing-id", adminId),
      (err) => err.statusCode === 404 && err.code === "USER_NOT_FOUND",
    );

    // Last admin protection
    await assert.rejects(
      () => service.setUserInactive("last-admin", adminId),
      (err) => err.statusCode === 409 && err.code === "LAST_ADMIN_PROTECTED",
    );

    // Invalid transition
    const blockedUserService = createAdminUserService({
      users: { lockUserById: async () => ({ ...sampleCustomer, status: "blocked" }) },
      transaction: async (fn) => fn({}),
    });
    await assert.rejects(
      () => blockedUserService.setUserInactive(customerId, adminId),
      (err) => err.statusCode === 409 && err.code === "INVALID_STATUS_TRANSITION",
    );
  });
});

