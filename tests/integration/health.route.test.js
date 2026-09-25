import { describe, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

describe("health endpoint", () => {
  test("reports the API is up", async () => {
    const response = await request(app).get("/api/v1/health");
    assert.equal(response.status, 200);
    assert.equal(response.body.code, "HEALTHY");
    assert.equal(response.body.data.status, "up");
  });
});
