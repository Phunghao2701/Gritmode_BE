import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveCartOwner } from "../../../src/middlewares/cart.middleware.js";

const makeRequest = ({ headerToken, bodyToken } = {}) => ({
  body: bodyToken === undefined ? {} : { guest_token: bodyToken },
  user: null,
  get: (name) => name === "X-Guest-Token" ? headerToken : undefined,
});

describe("resolveCartOwner", () => {
  test("accepts the documented guest_token body fallback", () => {
    const req = makeRequest({ bodyToken: "guest_body_token_123" });
    let error;
    let nextCalled = false;

    resolveCartOwner()(req, {}, (nextError) => {
      error = nextError;
      nextCalled = true;
    });

    assert.equal(error, undefined);
    assert.equal(nextCalled, true);
    assert.deepEqual(req.cartOwner, { type: "guest", guestToken: "guest_body_token_123" });
  });

  test("prefers the header token when both token forms are present", () => {
    const req = makeRequest({ headerToken: "guest_header_token_123", bodyToken: "guest_body_token_123" });
    resolveCartOwner()(req, {}, () => {});
    assert.deepEqual(req.cartOwner, { type: "guest", guestToken: "guest_header_token_123" });
  });
});
