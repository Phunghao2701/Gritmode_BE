import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { orderRepository } from "../../../src/repositories/order.repository.js";
import { paymentRepository } from "../../../src/repositories/payment.repository.js";

describe("order management repository extensions", () => {
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

  test("findUserOrders queries orders with pagination", async () => {
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

    const rows = await orderRepository.findUserOrders({ userId: "u1", page: 1, limit: 10 }, mockClient);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].order_code, "ORD-001");
  });

  test("countUserOrders returns total count", async () => {
    mockClient.query = mock.fn(async () => ({ rows: [{ count: "5" }], rowCount: 1 }));
    const total = await orderRepository.countUserOrders({ userId: "u1" }, mockClient);
    assert.equal(total, 5);
  });

  test("findUserOrderById returns detail with items and address", async () => {
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

    const res = await orderRepository.findUserOrderById(100, "u1", mockClient);
    assert.ok(res);
    assert.equal(res.order_id, 100);
    assert.equal(res.items.length, 1);
    assert.equal(res.address.receiver_name_order_address, "Nguyen Van A");
  });

  test("findGuestOrder returns guest order matching 3 verification fields", async () => {
    mockClient.query = mock.fn(async (sql) => {
      if (sql.includes("FROM \"order\"")) {
        return {
          rows: [
            {
              order_id: 200,
              order_code: "ORD-002",
              email_order: "guest@example.com",
              phone_order: "0901234567",
              user_id: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM order_item")) {
        return { rows: [{ order_item_id: 2, name_product_order_item: "Cap" }], rowCount: 1 };
      }
      if (sql.includes("FROM order_address")) {
        return { rows: [{ receiver_name_order_address: "Guest User" }], rowCount: 1 };
      }
      if (sql.includes("FROM payment")) {
        return { rows: [{ payment_method: "payos", status_payment: "paid" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await orderRepository.findGuestOrder(
      { orderCode: "ORD-002", email: "guest@example.com", phone: "0901234567" },
      mockClient,
    );
    assert.ok(res);
    assert.equal(res.order_code, "ORD-002");
    assert.equal(res.items.length, 1);
  });

  test("updateOrderStatus updates status and returns updated record", async () => {
    mockClient.query = mock.fn(async () => ({
      rows: [{ order_id: 100, status_order: "cancelled" }],
      rowCount: 1,
    }));

    const res = await orderRepository.updateOrderStatus(100, "cancelled", mockClient);
    assert.ok(res);
    assert.equal(res.status_order, "cancelled");
  });

  test("cancelPendingPaymentByOrderId cancels pending payment", async () => {
    mockClient.query = mock.fn(async () => ({
      rows: [{ payment_id: 1, status_payment: "cancelled" }],
      rowCount: 1,
    }));

    const res = await paymentRepository.cancelPendingPaymentByOrderId(100, mockClient);
    assert.ok(res);
    assert.equal(res.status_payment, "cancelled");
  });
});
