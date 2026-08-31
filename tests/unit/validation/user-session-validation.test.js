import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateSessionId } from "../../../src/utils/validation.js";

describe("user session validation primitives", () => {
  describe("validateSessionId", () => {
    test("accepts valid positive integer session ID", () => {
      assert.equal(validateSessionId(1), 1);
      assert.equal(validateSessionId("10"), 10);
      assert.equal(validateSessionId(" 25 "), 25);
    });

    test("rejects non-positive, zero or invalid session IDs", () => {
      assert.throws(() => validateSessionId("0"));
      assert.throws(() => validateSessionId("-5"));
      assert.throws(() => validateSessionId("abc"));
      assert.throws(() => validateSessionId(null));
      assert.throws(() => validateSessionId(undefined));
      assert.throws(() => validateSessionId(false));
    });
  });
});
