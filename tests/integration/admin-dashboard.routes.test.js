import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import pool from "../../src/config/database.js";

process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const adminId = "00000000-0000-4000-8000-000000000001";
const customerId = "00000000-0000-4000-8000-000000000002";

const adminToken = createAccessToken(
  { user_id: adminId, role: "admin", session_id: 1 },
  { secret, expiresIn: "1h" },
);

const customerToken = createAccessToken(
  { user_id: customerId, role: "customer", session_id: 2 },
  { secret, expiresIn: "1h" },
);

describe("admin dashboard routes integration", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test("GET /api/v1/admin/dashboard/stats requires auth and admin role", async () => {
    const unauth = await request(app).get("/api/v1/admin/dashboard/stats");
    assert.equal(unauth.status, 401);

    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      role: "customer",
      status: "active",
    }));

    const forbidden = await request(app)
      .get("/api/v1/admin/dashboard/stats")
      .set("Authorization", `Bearer ${customerToken}`);
    assert.equal(forbidden.status, 403);
  });

  test("GET /api/v1/admin/dashboard/stats returns stats successfully for admin", async () => {
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      role: "admin",
      status: "active",
    }));

    mock.method(pool, "query", async (sql) => {
      if (sql.includes('"order"')) {
        return {
          rows: [
            {
              revenue_this_month: 2500000,
              revenue_last_month: 2000000,
              total_orders: 15,
              orders_this_month: 5,
              orders_last_month: 4,
            },
          ],
        };
      }
      if (sql.includes("product")) {
        return {
          rows: [
            {
              total_products: 20,
              active_products: 18,
              products_this_month: 3,
            },
          ],
        };
      }
      if (sql.includes('"user"')) {
        return {
          rows: [
            {
              total_users: 50,
              users_this_month: 10,
              users_last_month: 8,
            },
          ],
        };
      }
      if (sql.includes("inventory")) {
        return {
          rows: [
            {
              low_stock_count: 2,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .get("/api/v1/admin/dashboard/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.revenueThisMonth, 2500000);
    assert.equal(res.body.data.revenueChange, "+25%");
    assert.equal(res.body.data.totalOrders, 15);
    assert.equal(res.body.data.totalProducts, 18);
    assert.equal(res.body.data.totalUsers, 50);
    assert.equal(res.body.data.lowStockCount, 2);
  });
});
