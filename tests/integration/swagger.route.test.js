import { describe, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.JWT_SECRET ||= "swagger-test-secret";
const { default: app } = await import("../../src/app.js");

describe("Swagger documentation", () => {
  test("serves Swagger UI", async () => {
    const response = await request(app).get("/api-docs/");
    assert.equal(response.status, 200);
    assert.match(response.text, /Gritmode API Documentation/);
    assert.match(response.text, /id="swagger-ui"/);
  });

  test("serves the generated OpenAPI JSON spec from JSDoc", async () => {
    const response = await request(app).get("/api-docs.json");
    assert.equal(response.status, 200);
    assert.equal(response.body.openapi, "3.0.0");
    assert.equal(response.body.info.title, "Gritmode API Documentation");
    assert.ok(response.body.paths["/auth/request-otp"]);
    assert.ok(response.body.paths["/auth/verify-otp"]);
    assert.ok(response.body.paths["/users/me"]);
    assert.ok(response.body.paths["/products"]);
  });
});
