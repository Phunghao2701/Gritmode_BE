import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createUserService,
  getProfile,
  updateProfile,
  changePassword,
  listSessions,
  revokeSession,
  revokeAllSessions,
} from "../../../src/services/user.service.js";

const baseUser = {
  user_id: "u1",
  email: "user@example.com",
  password: "hashed_password",
  full_name: "Original Name",
  phone: "0912345678",
  status: "active",
  type: "local",
  role: "customer",
};

describe("user service", () => {
  const transaction = async (fn) => fn({});

  test("returns a safe profile", async () => {
    const service = createUserService({
      users: { findById: async () => baseUser },
      transaction,
    });
    const profile = await service.getProfile("u1");
    assert.equal(profile.password, undefined);
    assert.equal(profile.email, "user@example.com");
  });

  test("getProfile throws USER_NOT_FOUND when user does not exist", async () => {
    const service = createUserService({
      users: { findById: async () => null },
      transaction,
    });
    await assert.rejects(
      service.getProfile("missing-user"),
      (error) => error.code === "USER_NOT_FOUND" && error.statusCode === 404,
    );
  });

  test("rejects privilege fields in profile updates", async () => {
    const service = createUserService({
      users: { findById: async () => baseUser },
      transaction,
    });
    for (const field of ["role", "status", "type", "password", "email", "user_id"]) {
      await assert.rejects(
        service.updateProfile("u1", { [field]: "hacked" }),
        (error) => error.code === "PROFILE_FIELD_FORBIDDEN" && error.statusCode === 403,
      );
    }
  });

  test("rejects duplicate phone when updating profile (pre-check)", async () => {
    const service = createUserService({
      users: {
        findById: async () => baseUser,
        findByPhone: async (phone) => (phone === "0987654321" ? { user_id: "other_user" } : null),
      },
      transaction,
    });

    await assert.rejects(
      service.updateProfile("u1", { phone: "0987654321" }),
      (error) => error.code === "PHONE_EXISTS" && error.statusCode === 409,
    );
  });

  test("catches database unique constraint error 23505 and throws 409 PHONE_EXISTS", async () => {
    const dbUniqueError = new Error("duplicate key value violates unique constraint user_phone_unique");
    dbUniqueError.code = "23505";
    dbUniqueError.constraint = "user_phone_unique";

    const service = createUserService({
      users: {
        findById: async () => baseUser,
        findByPhone: async () => null, // passes precheck (e.g. race condition)
        updateProfile: async () => {
          throw dbUniqueError;
        },
      },
      transaction,
    });

    await assert.rejects(
      service.updateProfile("u1", { phone: "0987654321" }),
      (error) => error.code === "PHONE_EXISTS" && error.statusCode === 409,
    );
  });

  test("updateProfile re-throws generic non-23505 database errors", async () => {
    const genericDbError = new Error("Database connection lost");
    genericDbError.code = "08006";

    const service = createUserService({
      users: {
        findById: async () => baseUser,
        findByPhone: async () => null,
        updateProfile: async () => {
          throw genericDbError;
        },
      },
      transaction,
    });

    await assert.rejects(
      service.updateProfile("u1", { full_name: "New Name" }),
      (error) => error.message === "Database connection lost",
    );
  });

  test("updateProfile throws USER_NOT_FOUND if updated row is null", async () => {
    const service = createUserService({
      users: {
        findById: async () => null,
        findByPhone: async () => null,
        updateProfile: async () => null,
      },
      transaction,
    });

    await assert.rejects(
      service.updateProfile("missing-user", { full_name: "New Name" }),
      (error) => error.code === "USER_NOT_FOUND" && error.statusCode === 404,
    );
  });

  test("updates allowed profile fields safely", async () => {
    const service = createUserService({
      users: {
        findById: async () => baseUser,
        findByPhone: async () => null,
        updateProfile: async (id, data) => ({ ...baseUser, ...data }),
      },
      transaction,
    });

    const updated = await service.updateProfile("u1", { full_name: "New Name", phone: "0900000000" });
    assert.equal(updated.full_name, "New Name");
    assert.equal(updated.phone, "0900000000");
  });

  test("rejects password changes because authentication is passwordless", async () => {
    const service = createUserService();
    await assert.rejects(
      service.changePassword("u1", { current_password: "OldPass@123", new_password: "NewPass@123" }, 42),
      (error) => error.code === "PASSWORD_NOT_SUPPORTED" && error.statusCode === 400,
    );
  });

  test("changePassword rejects when session_id is missing or falsy without changing password", async () => {
    let updatePasswordCalled = false;
    const service = createUserService({
      users: {
        findById: async () => baseUser,
        updatePassword: async () => {
          updatePasswordCalled = true;
        },
      },
      passwords: {
        compare: async () => true,
        hash: async (plain) => `hashed_${plain}`,
      },
      transaction,
    });

    await assert.rejects(
      service.changePassword("u1", { current_password: "OldPass@123", new_password: "NewPass@123" }, null),
      (error) => error.code === "SESSION_REQUIRED" && error.statusCode === 401,
    );
    await assert.rejects(
      service.changePassword("u1", { current_password: "OldPass@123", new_password: "NewPass@123" }, undefined),
      (error) => error.code === "SESSION_REQUIRED" && error.statusCode === 401,
    );
    assert.equal(updatePasswordCalled, false);
  });

  test("rejects password changes if current password is wrong", async () => {
    const service = createUserService({
      users: { findById: async () => baseUser },
      passwords: { compare: async () => false },
      transaction,
    });

    await assert.rejects(
      service.changePassword("u1", { current_password: "WrongPassword!123", new_password: "NewPass@123" }, 1),
      (error) => error.code === "PASSWORD_NOT_SUPPORTED" && error.statusCode === 400,
    );
  });

  test("rejects password changes if new password matches old password", async () => {
    const service = createUserService({
      users: { findById: async () => baseUser },
      passwords: { compare: async () => true },
      transaction,
    });

    await assert.rejects(
      service.changePassword("u1", { current_password: "SamePass@123", new_password: "SamePass@123" }, 1),
      (error) => error.code === "PASSWORD_NOT_SUPPORTED" && error.statusCode === 400,
    );
  });

  test("rejects password changes for Google accounts", async () => {
    const service = createUserService({
      users: { findById: async () => ({ ...baseUser, type: "google" }) },
      transaction,
    });

    await assert.rejects(
      service.changePassword("u1", { current_password: "Pass@123", new_password: "NewPass@123" }, 1),
      (error) => error.code === "PASSWORD_NOT_SUPPORTED" && error.statusCode === 400,
    );
  });

  test("lists and revokes owned sessions", async () => {
    const service = createUserService({
      sessions: {
        listByUser: async () => [{ user_session_id: 1 }],
        revokeOwned: async (id) => id === 1,
        revokeAllByUser: async () => {},
      },
      transaction,
    });

    const sessions = await service.listSessions("u1");
    assert.equal(sessions.length, 1);
    await service.revokeSession("u1", 1);
    await assert.rejects(
      service.revokeSession("u1", 2),
      (error) => error.code === "SESSION_NOT_FOUND" && error.statusCode === 404,
    );
    await service.revokeAllSessions("u1");
  });

  test("exported standalone functions exist", () => {
    assert.equal(typeof getProfile, "function");
    assert.equal(typeof updateProfile, "function");
    assert.equal(typeof changePassword, "function");
    assert.equal(typeof listSessions, "function");
    assert.equal(typeof revokeSession, "function");
    assert.equal(typeof revokeAllSessions, "function");
  });
});
