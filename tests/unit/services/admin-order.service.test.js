import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createAdminOrderService } from "../../../src/services/admin-order.service.js";

const sampleDetail = {
  order_id: 100,
  order_code: "ORD-001",
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
  address: { receiver_name_order_address: "Nguyen Van A" },
  payment: { payment_method: "cod", status_payment: "pending" },
};

describe("admin order service", () => {
  const transaction = async (fn) => fn({});

  // ── getOrders & getOrderById ─────────────────────────────────────────────
  test("getOrders returns list and pagination", async () => {
    const service = createAdminOrderService({
      orders: {
        findAdminOrders: async () => [sampleDetail],
        countAdminOrders: async () => 1,
      },
    });

    const result = await service.getOrders({ page: 1, limit: 20 });
    assert.ok(result);
    assert.equal(result.items.length, 1);
    assert.equal(result.pagination.total, 1);
  });

  test("getOrderById returns detail when found", async () => {
    const service = createAdminOrderService({
      orders: {
        findAdminOrderById: async (id) => (id === 100 ? sampleDetail : null),
      },
    });

    const result = await service.getOrderById(100);
    assert.ok(result);
    assert.equal(result.order_id, 100);
  });

  test("getOrderById throws 404 when missing", async () => {
    const service = createAdminOrderService({
      orders: {
        findAdminOrderById: async () => null,
      },
    });

    await assert.rejects(
      () => service.getOrderById(999),
      (err) => err.statusCode === 404 && err.code === "ORDER_NOT_FOUND",
    );
  });

  // ── Status Transitions ───────────────────────────────────────────────────
  test("confirmOrder transitions pending to confirmed", async () => {
    let loggedAction = null;
    const service = createAdminOrderService({
      orders: {
        lockOrderById: async () => sampleDetail,
        findAdminOrderById: async () => sampleDetail,
        updateOrderStatus: async (id, st) => ({ ...sampleDetail, status_order: st }),
      },
      audits: {
        log: async ({ action }) => { loggedAction = action; },
      },
      transaction,
    });

    const result = await service.confirmOrder(100, "admin-1");
    assert.ok(result);
    assert.equal(result.status_order, "confirmed");
    assert.equal(loggedAction, "ORDER_CONFIRMED");
  });

  test("confirmOrder rejects payOS order if payment is pending", async () => {
    const payosPending = {
      ...sampleDetail,
      payment: { payment_method: "payos", status_payment: "pending" },
    };

    const service = createAdminOrderService({
      orders: {
        lockOrderById: async () => payosPending,
        findAdminOrderById: async () => payosPending,
      },
      transaction,
    });

    await assert.rejects(
      () => service.confirmOrder(100, "admin-1"),
      (err) => err.statusCode === 409 && err.code === "PAYMENT_NOT_PAID",
    );
  });

  test("processOrder transitions confirmed to processing", async () => {
    const confirmedOrder = { ...sampleDetail, status_order: "confirmed" };
    const service = createAdminOrderService({
      orders: {
        lockOrderById: async () => confirmedOrder,
        findAdminOrderById: async () => confirmedOrder,
        updateOrderStatus: async (id, st) => ({ ...confirmedOrder, status_order: st }),
      },
      audits: { log: async () => {} },
      transaction,
    });

    const result = await service.processOrder(100, "admin-1");
    assert.ok(result);
    assert.equal(result.status_order, "processing");
  });

  test("shipOrder transitions processing to shipping", async () => {
    const processingOrder = { ...sampleDetail, status_order: "processing" };
    const service = createAdminOrderService({
      orders: {
        lockOrderById: async () => processingOrder,
        findAdminOrderById: async () => processingOrder,
        updateOrderStatus: async (id, st) => ({ ...processingOrder, status_order: st }),
      },
      audits: { log: async () => {} },
      transaction,
    });

    const result = await service.shipOrder(100, "admin-1");
    assert.ok(result);
    assert.equal(result.status_order, "shipping");
  });

  test("completeOrder transitions shipping to completed, commits inventory, marks COD as paid", async () => {
    const shippingOrder = { ...sampleDetail, status_order: "shipping" };
    let committedQty = 0;
    let codMarked = false;

    const service = createAdminOrderService({
      orders: {
        lockOrderById: async () => shippingOrder,
        findAdminOrderById: async () => shippingOrder,
        findOrderItems: async () => shippingOrder.items,
        updateOrderStatus: async (id, st) => ({ ...shippingOrder, status_order: st }),
      },
      inventories: {
        commitReservedStock: async (vid, qty) => { committedQty += qty; },
      },
      payments: {
        markCodAsPaid: async () => { codMarked = true; },
      },
      audits: { log: async () => {} },
      transaction,
    });

    const result = await service.completeOrder(100, "admin-1");
    assert.ok(result);
    assert.equal(result.status_order, "completed");
    assert.equal(committedQty, 2);
    assert.equal(codMarked, true);
  });

  test("completeOrder rejects payOS order if payment is not paid", async () => {
    const shippingPayosPending = {
      ...sampleDetail,
      status_order: "shipping",
      payment: { payment_method: "payos", status_payment: "pending" },
    };

    const service = createAdminOrderService({
      orders: {
        lockOrderById: async () => shippingPayosPending,
        findAdminOrderById: async () => shippingPayosPending,
      },
      transaction,
    });

    await assert.rejects(
      () => service.completeOrder(100, "admin-1"),
      (err) => err.statusCode === 409 && err.code === "PAYMENT_NOT_PAID",
    );
  });

  test("cancelOrder releases inventory reservation, cancels pending payment, records audit log", async () => {
    let releasedQty = 0;
    let paymentCancelled = false;

    const service = createAdminOrderService({
      orders: {
        lockOrderById: async () => sampleDetail,
        findAdminOrderById: async () => sampleDetail,
        findOrderItems: async () => sampleDetail.items,
        updateOrderStatus: async (id, st) => ({ ...sampleDetail, status_order: st }),
      },
      inventories: {
        releaseReservedStock: async (vid, qty) => { releasedQty += qty; },
      },
      payments: {
        cancelPendingPaymentByOrderId: async () => { paymentCancelled = true; },
      },
      audits: { log: async () => {} },
      transaction,
    });

    const result = await service.cancelOrder(100, { reason: "Out of stock", adminUserId: "admin-1" });
    assert.ok(result);
    assert.equal(result.status_order, "cancelled");
    assert.equal(releasedQty, 2);
    assert.equal(paymentCancelled, true);
  });

  test("rejects invalid status transitions with 409 Conflict", async () => {
    const shippingOrder = { ...sampleDetail, status_order: "shipping" };
    const service = createAdminOrderService({
      orders: {
        lockOrderById: async () => shippingOrder,
        findAdminOrderById: async () => shippingOrder,
      },
      transaction,
    });

    await assert.rejects(
      () => service.confirmOrder(100, "admin-1"),
      (err) => err.statusCode === 409 && err.code === "INVALID_ORDER_TRANSITION",
    );

    await assert.rejects(
      () => service.processOrder(100, "admin-1"),
      (err) => err.statusCode === 409 && err.code === "INVALID_ORDER_TRANSITION",
    );

    await assert.rejects(
      () => service.shipOrder(100, "admin-1"),
      (err) => err.statusCode === 409 && err.code === "INVALID_ORDER_TRANSITION",
    );

    const pendingOrder = { ...sampleDetail, status_order: "pending" };
    const pendingService = createAdminOrderService({
      orders: {
        lockOrderById: async () => pendingOrder,
        findAdminOrderById: async () => pendingOrder,
      },
      transaction,
    });

    await assert.rejects(
      () => pendingService.completeOrder(100, "admin-1"),
      (err) => err.statusCode === 409 && err.code === "INVALID_ORDER_TRANSITION",
    );

    await assert.rejects(
      () => service.cancelOrder(100, { adminUserId: "admin-1" }),
      (err) => err.statusCode === 409 && err.code === "INVALID_ORDER_TRANSITION",
    );
  });

  test("rejects operations on missing order with 404 Not Found", async () => {
    const service = createAdminOrderService({
      orders: {
        lockOrderById: async () => null,
      },
      transaction,
    });

    await assert.rejects(() => service.confirmOrder(999, "admin-1"), (err) => err.statusCode === 404);
    await assert.rejects(() => service.processOrder(999, "admin-1"), (err) => err.statusCode === 404);
    await assert.rejects(() => service.shipOrder(999, "admin-1"), (err) => err.statusCode === 404);
    await assert.rejects(() => service.completeOrder(999, "admin-1"), (err) => err.statusCode === 404);
    await assert.rejects(() => service.cancelOrder(999, { adminUserId: "admin-1" }), (err) => err.statusCode === 404);
  });

  test("cancelOrder rejects cancelling directly paid payOS order", async () => {
    const paidPayos = {
      ...sampleDetail,
      payment: { payment_method: "payos", status_payment: "paid" },
    };
    const service = createAdminOrderService({
      orders: {
        lockOrderById: async () => paidPayos,
        findAdminOrderById: async () => paidPayos,
      },
      transaction,
    });

    await assert.rejects(
      () => service.cancelOrder(100, { adminUserId: "admin-1" }),
      (err) => err.statusCode === 409 && err.code === "PAID_ORDER_CANNOT_BE_DIRECTLY_CANCELLED",
    );
  });

  test("completeOrder completes paid payOS order successfully", async () => {
    const shippingPaidPayos = {
      ...sampleDetail,
      status_order: "shipping",
      payment: { payment_method: "payos", status_payment: "paid" },
    };
    const service = createAdminOrderService({
      orders: {
        lockOrderById: async () => shippingPaidPayos,
        findAdminOrderById: async () => shippingPaidPayos,
        findOrderItems: async () => shippingPaidPayos.items,
        updateOrderStatus: async (id, st) => ({ ...shippingPaidPayos, status_order: st }),
      },
      inventories: {
        commitReservedStock: async () => ({}),
      },
      audits: { log: async () => {} },
      transaction,
    });

    const result = await service.completeOrder(100, "admin-1");
    assert.equal(result.status_order, "completed");
  });

  test("cancelOrder cancels confirmed and processing orders successfully", async () => {
    for (const st of ["confirmed", "processing"]) {
      const order = { ...sampleDetail, status_order: st };
      const service = createAdminOrderService({
        orders: {
          lockOrderById: async () => order,
          findAdminOrderById: async () => order,
          findOrderItems: async () => order.items,
          updateOrderStatus: async (id, s) => ({ ...order, status_order: s }),
        },
        inventories: { releaseReservedStock: async () => ({}) },
        payments: { cancelPendingPaymentByOrderId: async () => ({}) },
        audits: { log: async () => {} },
        transaction,
      });

      const res = await service.cancelOrder(100, { adminUserId: "admin-1" });
      assert.equal(res.status_order, "cancelled");
    }
  });
});


