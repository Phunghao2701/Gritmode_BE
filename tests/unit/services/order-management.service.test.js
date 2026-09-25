import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createOrderService } from "../../../src/services/order.service.js";

const sampleUserOrder = {
  order_id: 100,
  order_code: "ORD-001",
  user_id: "u1",
  status_order: "pending",
  total_order: 500000,
  items: [
    {
      order_item_id: 1,
      product_variant_id: 101,
      name_product_order_item: "T-Shirt",
      quantity_order_item: 2,
    },
  ],
  address: { receiver_name_order_address: "User Name" },
  payment: { payment_method: "cod", status_payment: "pending" },
};

describe("order management service", () => {
  const transaction = async (fn) => fn({});

  // ── getUserOrders ────────────────────────────────────────────────────────
  test("getUserOrders returns paginated order list", async () => {
    const service = createOrderService({
      orders: {
        findUserOrders: async () => [sampleUserOrder],
        countUserOrders: async () => 1,
      },
    });

    const result = await service.getUserOrders("u1", { page: 1, limit: 10 });
    assert.ok(result);
    assert.equal(result.items.length, 1);
    assert.equal(result.pagination.total, 1);
    assert.equal(result.pagination.page, 1);
  });

  // ── getUserOrderById ─────────────────────────────────────────────────────
  test("getUserOrderById returns detail when owned by user", async () => {
    const service = createOrderService({
      orders: {
        findUserOrderById: async (id, uid) => (id === 100 && uid === "u1" ? sampleUserOrder : null),
      },
    });

    const result = await service.getUserOrderById(100, "u1");
    assert.ok(result);
    assert.equal(result.order_id, 100);
    assert.equal(result.items.length, 1);
  });

  test("getUserOrderById throws 404 when not found or owned by other user", async () => {
    const service = createOrderService({
      orders: {
        findUserOrderById: async () => null,
      },
    });

    await assert.rejects(
      () => service.getUserOrderById(999, "u1"),
      (err) => err.statusCode === 404 && err.code === "ORDER_NOT_FOUND",
    );
  });

  // ── cancelUserOrder ──────────────────────────────────────────────────────
  test("cancelUserOrder cancels pending/confirmed order, releases inventory & updates payment", async () => {
    let releasedQty = 0;
    let updatedStatus = null;
    let cancelledPaymentOrderId = null;

    const service = createOrderService({
      orders: {
        findUserOrderById: async () => sampleUserOrder,
        findOrderItems: async () => sampleUserOrder.items,
        updateOrderStatus: async (id, st) => {
          updatedStatus = st;
          return { ...sampleUserOrder, status_order: st };
        },
      },
      inventories: {
        releaseReservedStock: async (vid, qty) => {
          releasedQty += qty;
        },
      },
      payments: {
        cancelPendingPaymentByOrderId: async (id) => {
          cancelledPaymentOrderId = id;
        },
      },
      transaction,
    });

    const result = await service.cancelUserOrder(100, "u1");
    assert.ok(result);
    assert.equal(updatedStatus, "cancelled");
    assert.equal(releasedQty, 2);
    assert.equal(cancelledPaymentOrderId, 100);
  });

  test("cancelUserOrder rejects cancellation when status is shipping or completed", async () => {
    const service = createOrderService({
      orders: {
        findUserOrderById: async () => ({ ...sampleUserOrder, status_order: "shipping" }),
      },
      transaction,
    });

    await assert.rejects(
      () => service.cancelUserOrder(100, "u1"),
      (err) => err.statusCode === 409 && err.code === "ORDER_CANNOT_BE_CANCELLED",
    );
  });

  // ── lookupGuestOrder ─────────────────────────────────────────────────────
  test("lookupGuestOrder returns order when 3 fields match", async () => {
    const service = createOrderService({
      orders: {
        findGuestOrder: async () => sampleUserOrder,
      },
    });

    const result = await service.lookupGuestOrder({
      order_code: "ORD-001",
      email: "guest@example.com",
      phone: "0901234567",
    });
    assert.ok(result);
    assert.equal(result.order_code, "ORD-001");
  });

  test("lookupGuestOrder throws 404 when verification fails", async () => {
    const service = createOrderService({
      orders: {
        findGuestOrder: async () => null,
      },
    });

    await assert.rejects(
      () => service.lookupGuestOrder({ order_code: "ORD-001", email: "wrong@test.com", phone: "0901234567" }),
      (err) => err.statusCode === 404 && err.code === "ORDER_NOT_FOUND",
    );
  });

  // ── cancelGuestOrder ─────────────────────────────────────────────────────
  test("cancelGuestOrder cancels guest order and releases inventory", async () => {
    let releasedQty = 0;
    const service = createOrderService({
      orders: {
        findGuestOrder: async () => sampleUserOrder,
        findOrderItems: async () => sampleUserOrder.items,
        updateOrderStatus: async (id, st) => ({ ...sampleUserOrder, status_order: st }),
      },
      inventories: {
        releaseReservedStock: async (vid, qty) => {
          releasedQty += qty;
        },
      },
      payments: {
        cancelPendingPaymentByOrderId: async () => {},
      },
      transaction,
    });

    const result = await service.cancelGuestOrder("ORD-001", {
      email: "guest@example.com",
      phone: "0901234567",
    });
    assert.ok(result);
    assert.equal(result.status_order, "cancelled");
    assert.equal(releasedQty, 2);
  });
});
