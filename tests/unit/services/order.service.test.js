import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createOrderService } from "../../../src/services/order.service.js";

const sampleCart = { cart_id: 10, status_cart: "active", user_id: "u1" };
const sampleCartItems = [
  {
    cart_item_id: 1,
    product_variant_id: 101,
    name_product: "Logo T-Shirt",
    sku: "TS-BLK-M",
    variant: "Black / M",
    price: 500000,
    quantity: 2,
    quantity_available: 10,
  },
];

describe("order service", () => {
  const transaction = async (fn) => fn({});

  test("creates order with COD payment, reserves inventory, converts cart", async () => {
    let createdOrder = null;
    let createdItems = null;
    let createdAddress = null;
    let createdPayment = null;
    let reservedStock = [];
    let convertedCartId = null;
    let emailedOrder = null;

    const service = createOrderService({
      carts: {
        findActiveByOwner: async () => sampleCart,
        getDetailedItems: async () => sampleCartItems,
        updateStatus: async (cartId, status) => {
          if (status === "converted") convertedCartId = cartId;
        },
      },
      inventories: {
        lockStockByVariantId: async () => ({ quantity_available: 10 }),
        reserveStock: async (variantId, quantity) => {
          reservedStock.push({ variantId, quantity });
        },
      },
      orders: {
        createOrder: async (data) => {
          createdOrder = { order_id: 1001, ...data };
          return createdOrder;
        },
        createOrderItems: async (items) => {
          createdItems = items;
          return items;
        },
        createOrderAddress: async (addr) => {
          createdAddress = addr;
          return addr;
        },
      },
      payments: {
        createPayment: async ({ paymentMethod }) => {
          createdPayment = { payment_id: 1, payment_method: paymentMethod, status_payment: "pending" };
          return createdPayment;
        },
      },
      emails: { sendOrderConfirmationEmail: async (order) => { emailedOrder = order; } },
      transaction,
    });

    const result = await service.createOrder(
      {
        payment_method: "cod",
        receiver_name_order_address: "Nguyen Van A",
        phone_order_address: "0901234567",
        address_line_order_address: "123 Street",
        ward_order_address: "Ben Thanh",
        district_order_address: "District 1",
        province_order_address: "HCM",
      },
      { owner: { type: "user", userId: "u1" }, user: { user_id: "u1", email: "user@example.com", phone: "0901234567" } },
    );

    assert.ok(result);
    assert.equal(result.order_id, 1001);
    assert.equal(result.subtotal_order, 1000000);
    assert.equal(result.shipping_fee_order, 0);
    assert.equal(result.total_order, 1000000);
    assert.equal(result.status_order, "pending");
    assert.equal(result.payment.payment_method, "cod");
    assert.equal(convertedCartId, 10);
    assert.equal(reservedStock.length, 1);
    assert.equal(reservedStock[0].quantity, 2);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(emailedOrder.order_code, result.order_code);
    assert.equal(emailedOrder.items.length, 1);
  });

  test("creates order with payOS payment and returns payment url & qr", async () => {
    const service = createOrderService({
      carts: {
        findActiveByOwner: async () => sampleCart,
        getDetailedItems: async () => sampleCartItems,
        updateStatus: async () => {},
      },
      inventories: {
        lockStockByVariantId: async () => ({ quantity_available: 10 }),
        reserveStock: async () => {},
      },
      orders: {
        createOrder: async (data) => ({ order_id: 1002, ...data }),
        createOrderItems: async () => [],
        createOrderAddress: async () => ({}),
      },
      payments: {
        createPayment: async () => ({
          payment_method: "payos",
          status_payment: "pending",
          checkout_url: "https://pay.payos.vn/web/123",
          qr_code: "00020101021238...",
        }),
      },
      transaction,
    });

    const result = await service.createOrder(
      {
        payment_method: "payos",
        receiver_name_order_address: "Nguyen Van B",
        phone_order_address: "0901234567",
        address_line_order_address: "456 Street",
        ward_order_address: "Ward 2",
        district_order_address: "District 2",
        province_order_address: "HCM",
      },
      { owner: { type: "user", userId: "u1" }, user: { user_id: "u1", email: "u@example.com" } },
    );

    assert.ok(result);
    assert.equal(result.order_id, 1002);
    assert.equal(result.payment.payment_method, "payos");
    assert.ok(result.payment.checkout_url);
    assert.ok(result.payment.qr_code);
  });

  test("applies voucher and increments voucher usage", async () => {
    let incrementedVoucherId = null;

    const service = createOrderService({
      carts: {
        findActiveByOwner: async () => sampleCart,
        getDetailedItems: async () => sampleCartItems,
        updateStatus: async () => {},
      },
      inventories: {
        lockStockByVariantId: async () => ({ quantity_available: 10 }),
        reserveStock: async () => {},
      },
      vouchers: {
        validateVoucher: async () => ({
          voucher: { voucher_id: 5, code_voucher: "SALE100" },
          discount_amount: 100000,
        }),
        incrementUsage: async (id) => { incrementedVoucherId = id; },
      },
      orders: {
        createOrder: async (data) => ({ order_id: 1003, ...data }),
        createOrderItems: async () => [],
        createOrderAddress: async () => ({}),
      },
      payments: {
        createPayment: async () => ({ payment_method: "cod", status_payment: "pending" }),
      },
      transaction,
    });

    const result = await service.createOrder(
      {
        payment_method: "cod",
        voucher_code: "SALE100",
        receiver_name_order_address: "Nguyen Van C",
        phone_order_address: "0901234567",
        address_line_order_address: "789 Street",
        ward_order_address: "Ward 3",
        district_order_address: "District 3",
        province_order_address: "HCM",
      },
      { owner: { type: "user", userId: "u1" }, user: { user_id: "u1", email: "u@test.com" } },
    );

    assert.ok(result);
    assert.equal(result.subtotal_order, 1000000);
    assert.equal(result.discount_order, 100000);
    assert.equal(result.shipping_fee_order, 0);
    assert.equal(result.total_order, 900000);
    assert.equal(incrementedVoucherId, 5);
  });

  test("rejects checkout when cart is empty or missing", async () => {
    const service = createOrderService({
      carts: {
        findActiveByOwner: async () => null,
      },
      transaction,
    });

    await assert.rejects(
      () => service.createOrder({ payment_method: "cod" }, { owner: { type: "user", userId: "u1" } }),
      (err) => err.statusCode === 404 && err.code === "CART_NOT_FOUND",
    );

    const emptyService = createOrderService({
      carts: {
        findActiveByOwner: async () => sampleCart,
        getDetailedItems: async () => [],
      },
      transaction,
    });

    await assert.rejects(
      () => emptyService.createOrder({ payment_method: "cod" }, { owner: { type: "user", userId: "u1" } }),
      (err) => err.statusCode === 400 && err.code === "CART_EMPTY",
    );
  });

  test("rejects checkout when variant is out of stock", async () => {
    const service = createOrderService({
      carts: {
        findActiveByOwner: async () => sampleCart,
        getDetailedItems: async () => sampleCartItems,
      },
      inventories: {
        lockStockByVariantId: async () => ({ quantity_available: 1 }), // Needs 2!
      },
      transaction,
    });

    await assert.rejects(
      () => service.createOrder(
        {
          payment_method: "cod",
          receiver_name_order_address: "Nguyen Van A",
          phone_order_address: "0901234567",
          address_line_order_address: "123 Street",
          ward_order_address: "Ben Thanh",
          district_order_address: "District 1",
          province_order_address: "HCM",
        },
        { owner: { type: "user", userId: "u1" }, user: { user_id: "u1", email: "user@example.com" } },
      ),
      (err) => err.statusCode === 409 && err.code === "INSUFFICIENT_STOCK",
    );
  });

  test("rejects user checkout with non-existent saved address", async () => {
    const service = createOrderService({
      carts: {
        findActiveByOwner: async () => sampleCart,
        getDetailedItems: async () => sampleCartItems,
      },
      inventories: {
        lockStockByVariantId: async () => ({ quantity_available: 10 }),
        reserveStock: async () => {},
      },
      addresses: {
        findById: async () => null,
      },
      transaction,
    });

    await assert.rejects(
      () => service.createOrder(
        { payment_method: "cod", user_address_id: 999 },
        { owner: { type: "user", userId: "u1" }, user: { user_id: "u1", email: "u1@test.com" } },
      ),
      (err) => err.statusCode === 404 && err.code === "ADDRESS_NOT_FOUND",
    );
  });

  test("getUserOrderById and cancelUserOrder enforce ownership and state", async () => {
    const service = createOrderService({
      orders: {
        findUserOrderById: async (id, uid) => {
          if (id === 1 && uid === "u1") return { order_id: 1, user_id: "u1", status_order: "pending" };
          if (id === 2 && uid === "u1") return { order_id: 2, user_id: "u1", status_order: "shipping" };
          return null;
        },
        findOrderItems: async () => [],
        updateOrderStatus: async () => ({ order_id: 1, status_order: "cancelled" }),
      },
      inventories: {
        releaseReservedStock: async () => {},
      },
      payments: {
        cancelPendingPaymentByOrderId: async () => {},
      },
      transaction,
    });

    // 404 on missing order
    await assert.rejects(
      () => service.getUserOrderById(999, "u1"),
      (err) => err.statusCode === 404 && err.code === "ORDER_NOT_FOUND",
    );

    // Cancel rejects non-pending/confirmed order
    await assert.rejects(
      () => service.cancelUserOrder(2, "u1"),
      (err) => err.statusCode === 409 && err.code === "ORDER_CANNOT_BE_CANCELLED",
    );

    // Cancel pending succeeds
    const cancelled = await service.cancelUserOrder(1, "u1");
    assert.equal(cancelled.order_id, 1);
  });

  test("lookupGuestOrder and cancelGuestOrder verify 3 fields and handle errors", async () => {
    const service = createOrderService({
      orders: {
        findGuestOrder: async ({ orderCode, email, phone }) => {
          if (orderCode === "G1" && email === "g@test.com" && phone === "0901234567") {
            return { order_id: 10, order_code: "G1", status_order: "pending", items: [] };
          }
          if (orderCode === "G2") {
            return { order_id: 20, order_code: "G2", status_order: "completed", items: [] };
          }
          return null;
        },
        updateOrderStatus: async () => ({ order_id: 10, status_order: "cancelled" }),
      },
      inventories: {
        releaseReservedStock: async () => {},
      },
      payments: {
        cancelPendingPaymentByOrderId: async () => {},
      },
      transaction,
    });

    const found = await service.lookupGuestOrder({ order_code: "G1", email: "g@test.com", phone: "0901234567" });
    assert.equal(found.order_id, 10);

    await assert.rejects(
      () => service.lookupGuestOrder({ order_code: "G999", email: "x", phone: "y" }),
      (err) => err.statusCode === 404 && err.code === "ORDER_NOT_FOUND",
    );

    // Cancel guest missing
    await assert.rejects(
      () => service.cancelGuestOrder("G999", { email: "x", phone: "y" }),
      (err) => err.statusCode === 404 && err.code === "ORDER_NOT_FOUND",
    );

    // Cancel guest completed -> 409
    await assert.rejects(
      () => service.cancelGuestOrder("G2", { email: "g@test.com", phone: "0901234567" }),
      (err) => err.statusCode === 409 && err.code === "ORDER_CANNOT_BE_CANCELLED",
    );

    // Cancel guest pending -> success
    const cancelled = await service.cancelGuestOrder("G1", { email: "g@test.com", phone: "0901234567" });
    assert.equal(cancelled.order_id, 10);
    assert.equal(cancelled.status_order, "cancelled");
  });
});

