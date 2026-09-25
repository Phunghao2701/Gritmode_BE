import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  validateCreateAddress,
  validatePasswordChange,
  validateUpdateAddress,
  validateUpdateProfile,
  validatePositiveId,
} from "../../../src/utils/validation.js";
import { createAccessToken, createRefreshToken, hashToken, verifyAccessToken } from "../../../src/utils/tokens.js";
import { AppError } from "../../../src/errors/app-error.js";

describe("authentication & validation primitives", () => {

  test("address validation requires receiver, phone and address line", () => {
    const invalid = validateCreateAddress({ ward_user_address: "Ward 1" });
    assert.equal(invalid.ok, false);
    assert.ok(invalid.errors.some((item) => item.field === "receiver_name" || item.field === "receiver_name_user_address"));
    assert.ok(invalid.errors.some((item) => item.field === "phone" || item.field === "phone_user_address"));
    assert.ok(invalid.errors.some((item) => item.field === "address_line" || item.field === "address_line_user_address"));
  });

  test("validateCreateAddress accepts valid address payload", () => {
    const valid = validateCreateAddress({
      receiver_name_user_address: "  Nguyen Van A  ",
      phone_user_address: " 0912345678 ",
      address_line_user_address: " 123 Nguyen Trai ",
      ward_user_address: " Ward 1 ",
      district_user_address: " District 5 ",
      province_user_address: " Ho Chi Minh ",
      is_default: true,
    });

    assert.equal(valid.ok, true);
    assert.equal(valid.value.receiver_name_user_address, "Nguyen Van A");
    assert.equal(valid.value.phone_user_address, "0912345678");
    assert.equal(valid.value.address_line_user_address, "123 Nguyen Trai");
    assert.equal(valid.value.ward_user_address, "Ward 1");
    assert.equal(valid.value.is_default, true);
  });

  test("validateUpdateProfile rejects forbidden fields and validates inputs", () => {
    const forbidden = validateUpdateProfile({ role: "admin", full_name: "Valid Name" });
    assert.equal(forbidden.ok, false);
    assert.ok(forbidden.errors.some((e) => e.field === "role"));

    const invalidPhone = validateUpdateProfile({ phone: "123" });
    assert.equal(invalidPhone.ok, false);
    assert.ok(invalidPhone.errors.some((e) => e.field === "phone"));

    const valid = validateUpdateProfile({
      full_name: "  Le Van B  ",
      phone: "0987654321",
      date_of_birth: "2000-01-01",
      gender: true,
      url_image: "https://example.com/avatar.jpg",
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.full_name, "Le Van B");
    assert.equal(valid.value.phone, "0987654321");
    assert.equal(valid.value.gender, true);
  });

  test("validateUpdateAddress allows partial updates and rejects is_default and forbidden fields", () => {
    const invalidPhone = validateUpdateAddress({ phone_user_address: "abc" });
    assert.equal(invalidPhone.ok, false);
    assert.ok(invalidPhone.errors.some((e) => e.field === "phone" || e.field === "phone_user_address"));

    const forbiddenUser = validateUpdateAddress({ user_id: "fake_id" });
    assert.equal(forbiddenUser.ok, false);

    // is_default must be rejected in PATCH address (must use /default endpoint instead)
    const forbiddenDefault = validateUpdateAddress({ is_default: false });
    assert.equal(forbiddenDefault.ok, false);
    assert.ok(forbiddenDefault.errors.some((e) => e.field === "is_default"));

    const valid = validateUpdateAddress({ receiver_name_user_address: "  Updated Name  " });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.receiver_name_user_address, "Updated Name");
    assert.equal(valid.value.is_default, undefined);
  });

  test("validatePasswordChange validates required and policy fields", () => {
    const missing = validatePasswordChange({ current_password: "old" });
    assert.equal(missing.ok, false);
    assert.ok(missing.errors.some((e) => e.field === "new_password"));

    const weak = validatePasswordChange({ current_password: "old", new_password: "123" });
    assert.equal(weak.ok, false);
    assert.ok(missing.errors.some((e) => e.field === "new_password"));

    const valid = validatePasswordChange({
      current_password: "OldPassword!123",
      new_password: "NewStrongPassword!456",
    });
    assert.equal(valid.ok, true);
  });

  test("validatePositiveId accepts positive integer strings and rejects malformed values", () => {
    assert.equal(validatePositiveId("1"), 1);
    assert.equal(validatePositiveId("42"), 42);
    assert.equal(validatePositiveId(100), 100);

    const invalidCases = ["1abc", "01", "0", "1.5", "-1", "", null, undefined, "999999999999999999999999"];
    for (const val of invalidCases) {
      assert.throws(
        () => validatePositiveId(val),
        (error) => error.statusCode === 400 && error.code === "INVALID_ID",
      );
    }
  });

  test("access token round-trips only public identity claims", () => {
    const token = createAccessToken(
      {
        user_id: "user-123",
        role: "customer",
        password: "secret-hash",
      },
      { secret: "test-secret", expiresIn: "1h" },
    );

    const payload = verifyAccessToken(token, { secret: "test-secret" });
    assert.equal(payload.sub, "user-123");
    assert.equal(payload.role, "customer");
    assert.equal(payload.password, undefined);
  });

  test("refresh tokens are random and persisted only as deterministic hashes", () => {
    const token1 = createRefreshToken();
    const token2 = createRefreshToken();

    assert.notEqual(token1, token2);
    assert.equal(hashToken(token1), hashToken(token1));
    assert.notEqual(hashToken(token1), hashToken(token2));
  });

  test("AppError keeps a stable safe API code", () => {
    const error = new AppError(409, "EMAIL_EXISTS", "Email đã được sử dụng");
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "EMAIL_EXISTS");
  });
});
