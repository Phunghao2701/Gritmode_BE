import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { userRepository } from "../../../src/repositories/user.repository.js";
import { sessionRepository } from "../../../src/repositories/session.repository.js";
import { addressRepository } from "../../../src/repositories/address.repository.js";
import { cartRepository } from "../../../src/repositories/cart.repository.js";

afterEach(() => mock.restoreAll());

describe("repositories", () => {
  test("user repository maps OTP-schema lookup, create, update queries and phone check", async () => {
    const userRow = { user_id: "u1", email: "user@example.com", phone: "0912345678", status: "active" };
    const query = mock.fn(async () => ({ rows: [userRow] }));
    const client = { query };

    const byEmail = await userRepository.findByEmail("user@example.com", client);
    const byId = await userRepository.findById("u1", client);
    const byPhone = await userRepository.findByPhone("0912345678", client);
    const created = await userRepository.createFromOtp({ email: "a@b.com" }, client);
    const updatedProf = await userRepository.updateProfile("u1", { full_name: "New" }, client);

    assert.ok(byEmail !== undefined && byId !== undefined && byPhone !== undefined);
    assert.equal(created.email, "user@example.com");
    for (const call of query.mock.calls) {
      const sql = call.arguments[0];
      assert.doesNotMatch(sql, /\bpassword\b/);
      assert.doesNotMatch(sql, /\btype\b/);
    }
  });

  test("session repository executes full CRUD, token lookup and revoke operations", async () => {
    const sessionRow = {
      user_session_id: 1,
      user_id: "u1",
      user_agent: "agent",
      ip_address: "127.0.0.1",
      created_at: new Date(),
      expired_at: new Date(),
      revoked_at: null,
    };

    const responses = [
      { rows: [sessionRow] }, // create
      { rows: [sessionRow] }, // findActiveByHash
      { rowCount: 1 },        // revoke
      { rowCount: 1 },        // revokeByHash
      { rows: [sessionRow] }, // listByUser
      { rowCount: 1 },        // revokeOwned true
      { rowCount: 0 },        // revokeOwned false
      { rowCount: 1 },        // revokeAllByUser
      { rowCount: 2 },        // revokeOthers
    ];

    let capturedQueries = [];
    mock.method(pool, "query", async (sql, params) => {
      capturedQueries.push({ sql, params });
      return responses.shift();
    });

    const created = await sessionRepository.create({
      userId: "u1",
      refreshTokenHash: "hash123",
      userAgent: "agent",
      ipAddress: "127.0.0.1",
      expiresAt: new Date(),
    });
    assert.equal(created.user_session_id, 1);

    const active = await sessionRepository.findActiveByHash("hash123");
    assert.equal(active.user_session_id, 1);

    await sessionRepository.revoke(1);
    await sessionRepository.revokeByHash("hash123");

    const sessions = await sessionRepository.listByUser("u1");
    assert.equal(sessions[0].refresh_token_hash, undefined);
    assert.equal(sessions[0].user_session_id, 1);

    const ownedSuccess = await sessionRepository.revokeOwned(1, "u1");
    assert.equal(ownedSuccess, true);

    const ownedFail = await sessionRepository.revokeOwned(99, "u1");
    assert.equal(ownedFail, false);

    await sessionRepository.revokeAllByUser("u1");

    await sessionRepository.revokeOthers("u1", 1);
    const lastQuery = capturedQueries[capturedQueries.length - 1];
    assert.ok(lastQuery.sql.includes("user_id=$1 AND user_session_id<>$2"));
    assert.deepEqual(lastQuery.params, ["u1", 1]);

    // revokeOthers throws if currentSessionId is missing/falsy
    await assert.rejects(
      async () => sessionRepository.revokeOthers("u1", null),
      /currentSessionId is required/,
    );
    await assert.rejects(
      async () => sessionRepository.revokeOthers("u1", ""),
      /currentSessionId is required/,
    );
  });

  test("address repository performs owned CRUD, lookups and atomic default switch", async () => {
    const addressRow = {
      user_address_id: 1,
      user_id: "u1",
      receiver_name_user_address: "A",
      phone_user_address: "0912345678",
      address_line_user_address: "Street",
      is_default: false,
    };
    const responses = [
      { rows: [addressRow] },
      { rows: [addressRow] },
      { rows: [{ count: "1" }] },
      { rows: [addressRow] },
      // setDefault: 3 queries
      { rowCount: 1 },
      { rowCount: 1 },
      { rows: [{ ...addressRow, is_default: true }] },
      // update with fields
      { rows: [{ ...addressRow, receiver_name_user_address: "B" }] },
      // update empty payload falls back to findById
      { rows: [addressRow] },
      // remove
      { rowCount: 1 },
      // findNewest
      { rows: [{ ...addressRow, user_address_id: 2 }] },
      // unsetDefault
      { rows: [] },
    ];
    const query = mock.method(pool, "query", async () => responses.shift());

    const list = await addressRepository.list("u1");
    assert.equal(list.length, 1);

    const single = await addressRepository.findById(1, "u1");
    assert.equal(single.user_address_id, 1);

    const count = await addressRepository.countByUser("u1");
    assert.equal(count, 1);

    const created = await addressRepository.create("u1", { receiver_name_user_address: "A", phone_user_address: "0912345678", address_line_user_address: "Street" });
    assert.equal(created.user_address_id, 1);

    const defaulted = await addressRepository.setDefault(1, "u1");
    assert.equal(defaulted.is_default, true);

    const updated = await addressRepository.update(1, "u1", { receiver_name_user_address: "B" });
    assert.equal(updated.receiver_name_user_address, "B");

    const updatedEmpty = await addressRepository.update(1, "u1", {});
    assert.equal(updatedEmpty.user_address_id, 1);

    const removed = await addressRepository.remove(1, "u1");
    assert.equal(removed, true);

    const newest = await addressRepository.findNewest("u1");
    assert.equal(newest.user_address_id, 2);

    await addressRepository.unsetDefault("u1");
    assert.equal(query.mock.calls.length, 12);
  });

  test("cart repository merges duplicate variants and abandons guest cart", async () => {
    const responses = [
      { rowCount: 1, rows: [{ cart_id: 10 }] },
      { rowCount: 1, rows: [{ cart_id: 20 }] },
      { rows: [{ product_variant_id: 100, quantity_cart_item: 2, user_quantity: 0, available: 10 }] },
      { rowCount: 1 },
      { rowCount: 1 },
    ];

    const query = mock.method(pool, "query", async () => responses.shift());

    await cartRepository.mergeGuestCart({ guestToken: "token-1", userId: "u1" });
    assert.equal(query.mock.calls.length, 5);
  });

  test("cart repository rejects inventory overflow before writes", async () => {
    const responses = [
      { rowCount: 1, rows: [{ cart_id: 10 }] },
      { rowCount: 1, rows: [{ cart_id: 20 }] },
      { rows: [{ product_variant_id: 100, quantity_cart_item: 5, user_quantity: 6, available: 10 }] },
    ];

    mock.method(pool, "query", async () => responses.shift());

    await assert.rejects(
      cartRepository.mergeGuestCart({ guestToken: "token-1", userId: "u1" }),
      (error) => error.code === "CART_MERGE_INVENTORY_EXCEEDED" && error.statusCode === 409,
    );
  });
});
