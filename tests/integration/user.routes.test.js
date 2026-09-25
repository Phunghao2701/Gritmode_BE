import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { addressRepository } from "../../src/repositories/address.repository.js";
import { sessionRepository } from "../../src/repositories/session.repository.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const validToken = createAccessToken(
  { user_id: "11111111-1111-4111-8111-111111111111", role: "customer", session_id: 101 },
  { secret, expiresIn: "1h" },
);
const tokenWithoutSession = createAccessToken(
  { user_id: "11111111-1111-4111-8111-111111111111", role: "customer" },
  { secret, expiresIn: "1h" },
);

describe("user & address HTTP contract", () => {
  beforeEach(() => {
    mock.method(pool, "connect", async () => ({
      query: async () => ({ rows: [], rowCount: 1 }),
      release: () => {},
    }));
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      role: "customer",
      status: "active",
      email: "user@example.com",
      type: "local",
      password: bcrypt.hashSync("OldStrongPassword!123", 10),
    }));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test("unauthenticated requests to user endpoints are rejected", async () => {
    const endpoints = [
      ["get", "/api/v1/users/me"],
      ["patch", "/api/v1/users/me"],
      ["patch", "/api/v1/users/me/password"],
      ["get", "/api/v1/users/me/addresses"],
      ["post", "/api/v1/users/me/addresses"],
      ["get", "/api/v1/users/me/addresses/1"],
      ["patch", "/api/v1/users/me/addresses/1"],
      ["delete", "/api/v1/users/me/addresses/1"],
      ["patch", "/api/v1/users/me/addresses/1/default"],
      ["get", "/api/v1/users/me/sessions"],
      ["delete", "/api/v1/users/me/sessions"],
      ["delete", "/api/v1/users/me/sessions/1"],
    ];

    for (const [method, url] of endpoints) {
      const response = await request(app)[method](url);
      assert.equal(response.status, 401);
      assert.equal(response.body.code, "AUTH_REQUIRED");
    }
  });

  test("profile update rejects forbidden fields like role/email", async () => {
    const response = await request(app)
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ role: "admin" });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "VALIDATION_ERROR");
  });

  test("change password rejects invalid payload format", async () => {
    const response = await request(app)
      .patch("/api/v1/users/me/password")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ current_password: "short", new_password: "123" });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "VALIDATION_ERROR");
  });

  test("change password is explicitly unsupported for passwordless accounts", async () => {
    const response = await request(app)
      .patch("/api/v1/users/me/password")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        current_password: "OldStrongPassword!123",
        new_password: "NewStrongPassword!456",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "PASSWORD_NOT_SUPPORTED");
  });

  test("change password without session_id in token is rejected with 401 SESSION_REQUIRED", async () => {
    const response = await request(app)
      .patch("/api/v1/users/me/password")
      .set("Authorization", `Bearer ${tokenWithoutSession}`)
      .send({
        current_password: "OldStrongPassword!123",
        new_password: "NewStrongPassword!456",
      });

    assert.equal(response.status, 401);
    assert.equal(response.body.code, "SESSION_REQUIRED");
  });

  test("address creation rejects invalid missing fields", async () => {
    const response = await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ ward_user_address: "Ward 1" });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "VALIDATION_ERROR");
  });

  test("updating address with is_default is rejected with 400 VALIDATION_ERROR", async () => {
    const response = await request(app)
      .patch("/api/v1/users/me/addresses/1")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ is_default: false });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "VALIDATION_ERROR");
  });

  test("invalid addressId and sessionId parameters are rejected with 400 INVALID_ID", async () => {
    const invalidIds = ["1abc", "01", "0", "1.5", "-1", "abc"];
    for (const id of invalidIds) {
      const resGet = await request(app).get(`/api/v1/users/me/addresses/${id}`).set("Authorization", `Bearer ${validToken}`);
      assert.equal(resGet.status, 400);
      assert.equal(resGet.body.code, "INVALID_ID");

      const resPatch = await request(app)
        .patch(`/api/v1/users/me/addresses/${id}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ receiver_name_user_address: "New Name" });
      assert.equal(resPatch.status, 400);
      assert.equal(resPatch.body.code, "INVALID_ID");

      const resDelete = await request(app).delete(`/api/v1/users/me/addresses/${id}`).set("Authorization", `Bearer ${validToken}`);
      assert.equal(resDelete.status, 400);
      assert.equal(resDelete.body.code, "INVALID_ID");

      const resDefault = await request(app).patch(`/api/v1/users/me/addresses/${id}/default`).set("Authorization", `Bearer ${validToken}`);
      assert.equal(resDefault.status, 400);
      assert.equal(resDefault.body.code, "INVALID_ID");

      const resSession = await request(app).delete(`/api/v1/users/me/sessions/${id}`).set("Authorization", `Bearer ${validToken}`);
      assert.equal(resSession.status, 400);
      assert.equal(resSession.body.code, "INVALID_ID");
    }
  });

  test("get single address by ID returns 200 when found and 404 when missing", async () => {
    mock.method(addressRepository, "findById", async (addressId, userId) => {
      if (addressId === 1 && userId === "11111111-1111-4111-8111-111111111111") {
        return {
          user_address_id: 1,
          user_id: userId,
          receiver_name_user_address: "Nguyen Van A",
          phone_user_address: "0912345678",
          address_line_user_address: "123 Street",
          is_default: true,
        };
      }
      return null;
    });

    const successRes = await request(app)
      .get("/api/v1/users/me/addresses/1")
      .set("Authorization", `Bearer ${validToken}`);
    assert.equal(successRes.status, 200);
    assert.equal(successRes.body.data.user_address_id, 1);

    const notFoundRes = await request(app)
      .get("/api/v1/users/me/addresses/999")
      .set("Authorization", `Bearer ${validToken}`);
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.body.code, "ADDRESS_NOT_FOUND");
  });
});
