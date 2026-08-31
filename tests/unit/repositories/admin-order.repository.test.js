import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { orderRepository } from "../../../src/repositories/order.repository.js";
import { paymentRepository } from "../../../src/repositories/payment.repository.js";

describe("admin order repository extensions", () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: mock.fn(async () => ({ rows: [], rowCount: 0 })),
      release: mock.fn(),
    };
    mock.method(pool, "connect", async () => mockClient);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test("findAdminOrders queries orders with search, filters and sort", async () => {
    mockClient.query = mock.fn(async () => ({
      rows: [
        {
          order_id: 100,
          order_code: "ORD-001",
          status_order: "pending",
          total_order: 500000,
          payment_method: "cod",
          status_payment: "pending",
        },
      ],
      rowCount: 1,
    }));

    const rows = await orderRepository.findAdminOrders(
      {
        page: 1,
        limit: 20,
        search: "ORD-001",
        status_order: "pending",
        payment_method: "cod",
        status_payment: "pending",
        sort_by: "created_at",
        sort_order: "desc",
      },
      mockClient,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].order_code, "ORD-001");
  });

  test("countAdminOrders counts orders with filters", async () => {
    mockClient.query = mock.fn(async () => ({ rows: [{ count: "10" }], rowCount: 1 }));
    const total = await orderRepository.countAdminOrders({ status_order: "pending" }, mockClient);
    assert.equal(total, 10);
  });

  test("findAdminOrderById returns complete order detail", async () => {
    mockClient.query = mock.fn(async (sql) => {
      if (sql.includes("FROM \"order\"")) {
        return { rows: [{ order_id: 100, user_id: "u1", order_code: "ORD-001" }], rowCount: 1 };
      }
      if (sql.includes("FROM order_item")) {
        return { rows: [{ order_item_id: 1, name_product_order_item: "T-Shirt" }], rowCount: 1 };
      }
      if (sql.includes("FROM order_address")) {
        return { rows: [{ receiver_name_order_address: "Nguyen Van A" }], rowCount: 1 };
      }
      if (sql.includes("FROM payment")) {
        return { rows: [{ payment_method: "cod", status_payment: "pending" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await orderRepository.findAdminOrderById(100, mockClient);
    assert.ok(res);
    assert.equal(res.order_id, 100);
    assert.equal(res.items.length, 1);
    assert.equal(res.customer_type, "registered");
  });

  test("lockOrderById locks order row FOR UPDATE", async () => {
    mockClient.query = mock.fn(async () => ({
      rows: [{ order_id: 100, status_order: "pending" }],
      rowCount: 1,
    }));

    const res = await orderRepository.lockOrderById(100, mockClient);
    assert.ok(res);
    assert.equal(res.order_id, 100);
  });

  test("markCodAsPaid updates payment status to paid", async () => {
    mockClient.query = mock.fn(async () => ({
      rows: [{ payment_id: 1, status_payment: "paid" }],
      rowCount: 1,
    }));

    const res = await paymentRepository.markCodAsPaid(100, mockClient);
    assert.ok(res);
    assert.equal(res.status_payment, "paid");
  });
});
