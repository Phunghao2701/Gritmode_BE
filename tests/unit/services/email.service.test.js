import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createEmailService } from "../../../src/services/email.service.js";

describe("email service", () => {
  test("sends OTP through the configured transport without logging the OTP", async () => {
    let message;
    const service = createEmailService({
      env: {
        EMAIL_USER: "sender@example.com",
        CLIENT_ID: "client-id",
        CLIENT_SECRET: "client-secret",
        REFRESH_TOKEN: "refresh-token",
      },
      transportFactory: (config) => ({
        verify: async () => true,
        sendMail: async (input) => {
          message = input;
          assert.equal(config.auth.type, "OAuth2");
          return { messageId: "message-1" };
        },
      }),
    });

    const result = await service.sendOtpEmail({ email: "user@example.com", otp: "123456" });
    assert.equal(message.to, "user@example.com");
    assert.match(message.text, /123456/);
    assert.equal(result.message_id, "message-1");
  });

  test("rejects missing OAuth configuration", async () => {
    const service = createEmailService({ env: {}, transportFactory: () => assert.fail() });
    await assert.rejects(
      () => service.sendOtpEmail({ email: "user@example.com", otp: "123456" }),
      (error) => error.code === "EMAIL_CONFIG_MISSING" && error.statusCode === 500,
    );
  });

  test("maps provider failures to EMAIL_DELIVERY_FAILED", async () => {
    const service = createEmailService({
      env: {
        EMAIL_USER: "sender@example.com",
        CLIENT_ID: "client-id",
        CLIENT_SECRET: "client-secret",
        REFRESH_TOKEN: "refresh-token",
      },
      transportFactory: () => ({ sendMail: async () => { throw new Error("provider failed"); } }),
    });
    await assert.rejects(
      () => service.sendOtpEmail({ email: "user@example.com", otp: "123456" }),
      (error) => error.code === "EMAIL_DELIVERY_FAILED" && error.statusCode === 502,
    );
  });

  test("renders and sends a safe COD order confirmation", async () => {
    let message;
    const service = createEmailService({
      env: {
        EMAIL_USER: "sender@example.com",
        CLIENT_ID: "client-id",
        CLIENT_SECRET: "client-secret",
        REFRESH_TOKEN: "refresh-token",
        FRONTEND_URL: "https://gritmode.vn/",
        SUPPORT_HOTLINE: "0901 234 567",
      },
      transportFactory: () => ({
        sendMail: async (input) => { message = input; return { messageId: "order-message" }; },
      }),
    });
    const order = {
      order_code: "ORD-001",
      email_order: "buyer@example.com",
      created_at: "2026-09-01T10:00:00Z",
      subtotal_order: 539000,
      discount_order: 30000,
      shipping_fee_order: 0,
      total_order: 509000,
      payment: { payment_method: "cod", status_payment: "pending" },
      address: {
        receiver_name_order_address: "An <script>",
        phone_order_address: "0901234567",
        address_line_order_address: "123 Nguyễn Huệ",
        ward_order_address: "Bến Nghé",
        district_order_address: "Quận 1",
        province_order_address: "TP.HCM",
      },
      items: [
        { name_product_order_item: "Essential <Tee>", variant_order_item: "Đen · Size S", quantity_order_item: 1, total_order_item: 509000 },
        { name_product_order_item: "Second item", variant_order_item: "Trắng · Size M", quantity_order_item: 2, total_order_item: 30000, image_product: "https://img.test/item.jpg" },
      ],
    };

    await service.sendOrderConfirmationEmail(order);
    assert.equal(message.to, "buyer@example.com");
    assert.equal(message.subject, "GRITMODE | Xác nhận đơn hàng #ORD-001");
    assert.match(message.html, /ĐƠN HÀNG ĐÃ ĐƯỢC TIẾP NHẬN/);
    assert.doesNotMatch(message.html, /THANH TOÁN THÀNH CÔNG/);
    assert.match(message.html, /Essential &lt;Tee&gt;/);
    assert.match(message.html, /GRITMODE<\/div>/);
    assert.match(message.html, /https:\/\/gritmode\.vn\/orders\/lookup\?orderCode=ORD-001/);
  });

  test("shows paid wording only for a paid PayOS order", async () => {
    let html;
    const service = createEmailService({
      env: { EMAIL_USER: "sender@example.com", CLIENT_ID: "id", CLIENT_SECRET: "secret", REFRESH_TOKEN: "refresh", FRONTEND_URL: "https://gritmode.vn" },
      transportFactory: () => ({ sendMail: async (message) => { html = message.html; return {}; } }),
    });
    await service.sendOrderConfirmationEmail({
      order_code: "ORD-PAID", email_order: "buyer@example.com", created_at: new Date(),
      subtotal_order: 100000, discount_order: 0, shipping_fee_order: 0, total_order: 100000,
      payment: { payment_method: "payos", status_payment: "paid" }, items: [], address: {},
    });
    assert.match(html, /THANH TOÁN THÀNH CÔNG/);
    assert.match(html, /Đã thanh toán/);
  });
});
