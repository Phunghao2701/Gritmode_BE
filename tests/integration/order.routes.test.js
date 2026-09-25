import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import axios from "axios";
import pool from "../../src/config/database.js";
import { createAccessToken } from "../../src/utils/tokens.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { cartRepository } from "../../src/repositories/cart.repository.js";
import { inventoryRepository } from "../../src/repositories/inventory.repository.js";
import { orderRepository } from "../../src/repositories/order.repository.js";
import { paymentRepository } from "../../src/repositories/payment.repository.js";
import { voucherRepository } from "../../src/repositories/voucher.repository.js";
import { addressRepository } from "../../src/repositories/address.repository.js";


process.env.JWT_SECRET ||= "integration-test-secret";
const { default: app } = await import("../../src/app.js");

const secret = process.env.JWT_SECRET;
const validUserToken = createAccessToken(
  { user_id: "00000000-0000-4000-8000-000000000001", role: "customer", session_id: 1 },
  { secret, expiresIn: "1h" },
);

describe("order checkout HTTP contract", () => {
  beforeEach(() => {
    mock.method(pool, "connect", async () => ({
      query: async () => ({ rows: [], rowCount: 1 }),
      release: () => {},
    }));
    mock.method(userRepository, "findById", async (id) => ({
      user_id: id,
      email: "user@example.com",
      role: "customer",
      status: "active",
      phone: "0901234567",
    }));
    mock.method(axios, "post", async () => ({
      data: {
        code: "00",
        data: {
          checkoutUrl: "https://pay.payos.vn/100",
          qrCode: "QR100",
        },
      },
    }));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test("Guest checkout with COD creates order successfully", async () => {
    mock.method(cartRepository, "findActiveByOwner", async () => ({ cart_id: 10, status_cart: "active" }));
    mock.method(cartRepository, "getDetailedItems", async () => [
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
    ]);
    mock.method(inventoryRepository, "lockStockByVariantId", async () => ({ quantity_available: 10 }));
    mock.method(inventoryRepository, "reserveStock", async () => ({ quantity_stock: 10, quantity_reserved: 2, quantity_available: 8 }));
    mock.method(orderRepository, "createOrder", async (data) => ({ order_id: 101, ...data }));
    mock.method(orderRepository, "createOrderItems", async (items) => items);
    mock.method(orderRepository, "createOrderAddress", async (addr) => addr);
    mock.method(paymentRepository, "createPayment", async (data) => ({ payment_id: 1, ...data }));
    mock.method(cartRepository, "updateStatus", async () => ({}));

    const res = await request(app)
      .post("/api/v1/orders")
      .send({
        guest_token: "guest_1234567890abcdef",
        email_order: "guest@example.com",
        phone_order: "0901234567",
        receiver_name_order_address: "Guest User",
        phone_order_address: "0901234567",
        address_line_order_address: "123 Nguyen Trai",
        ward_order_address: "Ben Thanh",
        district_order_address: "District 1",
        province_order_address: "HCM",
        payment_method: "cod",
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.order_id, 101);
    assert.equal(res.body.data.payment.payment_method, "cod");
  });

  test("Authenticated user checkout with saved address creates order with payOS", async () => {
    mock.method(cartRepository, "findActiveByOwner", async () => ({ cart_id: 11, status_cart: "active" }));
    mock.method(cartRepository, "getDetailedItems", async () => [
      {
        cart_item_id: 1,
        product_variant_id: 101,
        name_product: "Logo T-Shirt",
        sku: "TS-BLK-M",
        variant: "Black / M",
        price: 500000,
        quantity: 1,
        quantity_available: 5,
      },
    ]);
    mock.method(inventoryRepository, "lockStockByVariantId", async () => ({ quantity_available: 5 }));
    mock.method(inventoryRepository, "reserveStock", async () => ({ quantity_stock: 5, quantity_reserved: 1, quantity_available: 4 }));
    mock.method(addressRepository, "findById", async () => ({
      user_address_id: 1,
      receiver_name_user_address: "User Name",
      phone_user_address: "0901234567",
      address_line_order_address: "123 Street",
      ward_user_address: "Ward 1",
      district_user_address: "District 1",
      province_user_address: "HCM",
    }));
    mock.method(orderRepository, "createOrder", async (data) => ({ order_id: 102, ...data }));
    mock.method(orderRepository, "createOrderItems", async (items) => items);
    mock.method(orderRepository, "createOrderAddress", async (addr) => addr);
    mock.method(paymentRepository, "createPayment", async (data) => ({
      payment_id: 2,
      ...data,
      checkout_url: "https://pay.payos.vn/123",
      qr_code: "QR123",
    }));
    mock.method(cartRepository, "updateStatus", async () => ({}));

    const res = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${validUserToken}`)
      .send({
        user_address_id: 1,
        payment_method: "payos",
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.payment.payment_method, "payos");
    assert.ok(res.body.data.payment.checkout_url);
  });

  test("Checkout rejects empty cart with 400", async () => {
    mock.method(cartRepository, "findActiveByOwner", async () => ({ cart_id: 12, status_cart: "active" }));
    mock.method(cartRepository, "getDetailedItems", async () => []);

    const res = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${validUserToken}`)
      .send({
        user_address_id: 1,
        payment_method: "cod",
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, "CART_EMPTY");
  });
});
