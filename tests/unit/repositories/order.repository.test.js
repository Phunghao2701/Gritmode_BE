import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import pool from "../../../src/config/database.js";
import { orderRepository } from "../../../src/repositories/order.repository.js";

describe("order repository", () => {
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

  // ── createOrder ──────────────────────────────────────────────────────────
  describe("createOrder", () => {
    test("inserts order and returns created record", async () => {
      const orderRow = {
        order_id: 100,
        order_code: "ORD-001",
        user_id: "u1",
        cart_id: 10,
        status_order: "pending",
        subtotal_order: 500000,
        total_order: 530000,
      };
      mockClient.query = mock.fn(async () => ({ rows: [orderRow], rowCount: 1 }));

      const res = await orderRepository.createOrder(orderRow, mockClient);
      assert.ok(res);
      assert.equal(res.order_id, 100);
      assert.equal(res.order_code, "ORD-001");
    });
  });

  // ── createOrderItems ─────────────────────────────────────────────────────
  describe("createOrderItems", () => {
    test("inserts batch order items", async () => {
      const item = {
        order_id: 100,
        product_variant_id: 101,
        name_product_order_item: "T-Shirt",
        sku_order_item: "TS-01",
        variant_order_item: "Black / M",
        price_order_item: 250000,
        quantity_order_item: 2,
        total_order_item: 500000,
      };
      mockClient.query = mock.fn(async () => ({ rows: [item], rowCount: 1 }));

      const res = await orderRepository.createOrderItems([item], mockClient);
      assert.ok(res);
      assert.equal(res.length, 1);
    });
  });

  // ── createOrderAddress ───────────────────────────────────────────────────
  describe("createOrderAddress", () => {
    test("inserts order address record", async () => {
      const addr = {
        order_id: 100,
        receiver_name_order_address: "Nguyen Van A",
        phone_order_address: "0901234567",
        address_line_order_address: "123 Street",
      };
      mockClient.query = mock.fn(async () => ({ rows: [addr], rowCount: 1 }));

      const res = await orderRepository.createOrderAddress(addr, mockClient);
      assert.ok(res);
      assert.equal(res.receiver_name_order_address, "Nguyen Van A");
    });
  });

  // ── findById & findByOrderCode ───────────────────────────────────────────
  describe("findById & findByOrderCode", () => {
    test("returns order by ID", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ order_id: 100 }], rowCount: 1 }));
      const res = await orderRepository.findById(100, mockClient);
      assert.ok(res);
      assert.equal(res.order_id, 100);
    });

    test("returns order by order_code", async () => {
      mockClient.query = mock.fn(async () => ({ rows: [{ order_code: "ORD-001" }], rowCount: 1 }));
      const res = await orderRepository.findByOrderCode("ORD-001", mockClient);
      assert.ok(res);
      assert.equal(res.order_code, "ORD-001");
    });
  });
});
