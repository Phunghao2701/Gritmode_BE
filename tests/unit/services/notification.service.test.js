import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createNotificationOutboxService } from "../../../src/services/notification-outbox.service.js";
import { createNotificationDispatcher } from "../../../src/services/notification-dispatcher.service.js";
import { createAdminNotificationService } from "../../../src/services/admin-notification.service.js";
import { notificationOutboxRepository } from "../../../src/repositories/notification-outbox.repository.js";

describe("notification services", () => {
  test("enqueues one deduplicated admin event and COD email", async () => {
    const adminCreates = [];
    const outboxCreates = [];
    const service = createNotificationOutboxService({
      adminNotifications: {
        create: async (payload) => {
          adminCreates.push(payload);
          return { admin_notification_id: 10, ...payload };
        },
      },
      outbox: {
        enqueue: async (payload) => {
          outboxCreates.push(payload);
          return { notification_outbox_id: 20, ...payload };
        },
      },
    });

    const result = await service.enqueueOrderCreated({
      client: {},
      order: {
        order_id: 100,
        order_code: "ORD-100",
        email_order: "buyer@example.com",
        status_order: "pending",
        total_order: 500000,
        payment: { payment_method: "cod" },
      },
    });

    assert.equal(adminCreates[0].dedupeKey, "order-created:admin:100");
    assert.equal(outboxCreates[0].dedupeKey, "order-created:email:100");
    assert.equal(result.adminNotification.admin_notification_id, 10);
    assert.equal(result.emailOutbox.notification_outbox_id, 20);
  });

  test("does not enqueue a creation email for an unpaid PayOS order", async () => {
    let emailEnqueueCount = 0;
    const service = createNotificationOutboxService({
      adminNotifications: { create: async () => ({ admin_notification_id: 1 }) },
      outbox: { enqueue: async () => { emailEnqueueCount += 1; } },
    });

    await service.enqueueOrderCreated({
      order: {
        order_id: 101,
        order_code: "ORD-101",
        email_order: "buyer@example.com",
        payment: { payment_method: "payos" },
      },
    });

    assert.equal(emailEnqueueCount, 0);
  });

  test("enqueues an allowlisted late PayOS payment review event", async () => {
    let payload;
    const service = createNotificationOutboxService({
      adminNotifications: {
        create: async (input) => {
          payload = input;
          return input;
        },
      },
    });

    await service.enqueuePayOSLatePaymentReview({
      client: {},
      order: { order_id: 102, order_code: "ORD-102", email_order: "private@example.com", phone_order: "0901234567" },
      payment: { payment_id: 202, amount_payment: 500000, payos_transaction_reference: "REF-202" },
    });

    assert.equal(payload.dedupeKey, "payos-late-settlement:admin:102:202");
    assert.deepEqual(payload.payload, {
      order_id: 102,
      payment_id: 202,
      amount_payment: 500000,
      provider_reference: "REF-202",
      reason: "PAYMENT_RECEIVED_AFTER_ORDER_CANCELLATION",
    });
    assert.equal(Object.hasOwn(payload.payload, "email"), false);
    assert.equal(Object.hasOwn(payload.payload, "phone"), false);
  });

  test("dispatches an outbox email and marks it sent", async () => {
    const calls = [];
    const dispatcher = createNotificationDispatcher({
      outbox: {
        claimBatch: async () => [{
          notification_outbox_id: 1,
          channel: "email",
          destination: "buyer@example.com",
          dedupe_key: "order-created:email:100",
          attempt_count: 1,
          payload: { order_id: 100 },
        }],
        markSent: async (id) => calls.push(["sent", id]),
        markFailed: async () => assert.fail("unexpected failure"),
      },
      orders: {
        findAdminOrderById: async () => ({
          order_id: 100,
          order_code: "ORD-100",
          email_order: "buyer@example.com",
          items: [],
          address: {},
        }),
      },
      emails: {
        sendOrderConfirmationEmail: async (order) => calls.push(["email", order.order_code]),
      },
      transaction: async (callback) => callback({}),
    });

    const result = await dispatcher.processBatch();
    assert.deepEqual(result, { claimed: 1, sent: 1, failed: 0 });
    assert.deepEqual(calls, [["email", "ORD-100"], ["sent", 1]]);
  });

  test("moves a repeatedly failing notification to dead letter", async () => {
    let failure;
    const dispatcher = createNotificationDispatcher({
      outbox: {
        claimBatch: async () => [{
          notification_outbox_id: 2,
          channel: "email",
          destination: "buyer@example.com",
          dedupe_key: "order-created:email:101",
          attempt_count: 5,
          payload: { order_id: 101 },
        }],
        markSent: async () => assert.fail("unexpected success"),
        markFailed: async (id, details) => { failure = { id, details }; },
      },
      orders: { findAdminOrderById: async () => null },
      transaction: async (callback) => callback({}),
      log: { error: () => {} },
    });

    const result = await dispatcher.processBatch();
    assert.equal(result.failed, 1);
    assert.equal(failure.id, 2);
    assert.equal(failure.details.deadLetter, true);
  });

  test("returns unread count for the current admin", async () => {
    const service = createAdminNotificationService({
      notifications: {
        list: async () => [{ admin_notification_id: 1, is_read: false }],
        count: async ({ unreadOnly }) => (unreadOnly ? 1 : 3),
      },
    });

    const result = await service.list("admin-1", { page: 1, limit: 10 });
    assert.equal(result.unread_count, 1);
    assert.equal(result.pagination.total, 3);
    assert.equal(result.items.length, 1);
  });

  test("marks all notifications as read for the current admin", async () => {
    let adminUserId;
    const service = createAdminNotificationService({
      notifications: {
        markAllRead: async (userId) => {
          adminUserId = userId;
          return { marked_count: 4 };
        },
      },
    });

    const result = await service.markAllRead("admin-1");
    assert.equal(adminUserId, "admin-1");
    assert.deepEqual(result, { marked_count: 4 });
  });

  test("qualifies the outbox columns when claiming rows with a CTE", async () => {
    let claimQuery = "";
    const client = {
      query: async (query) => {
        claimQuery = query;
        return { rows: [] };
      },
    };

    await notificationOutboxRepository.claimBatch({ limit: 1 }, client);

    assert.match(claimQuery, /RETURNING\s+outbox\.notification_outbox_id/);
    assert.match(claimQuery, /outbox\.updated_at/);
  });
});
