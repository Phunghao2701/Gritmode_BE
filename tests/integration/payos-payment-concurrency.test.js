import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createPayOSSignature } from "../../src/utils/payos.js";

const enabled = process.env.RUN_CONCURRENCY_TEST === "true";
const testDatabaseUrl = process.env.TEST_POSTGRES_URL;

if (!enabled) {
  test("PayOS concurrency tests require explicit opt-in", () => {
    assert.fail("Set RUN_CONCURRENCY_TEST=true and TEST_POSTGRES_URL to run isolated PayOS concurrency tests");
  });
} else if (!testDatabaseUrl || testDatabaseUrl.includes("<")) {
  test("PayOS concurrency tests require an isolated database URL", () => {
    assert.fail("TEST_POSTGRES_URL must point to an isolated local/staging PostgreSQL database");
  });
} else {
  process.env.POSTGRES_URL = testDatabaseUrl;
  process.env.PAYOS_CHECKSUM_KEY ||= "payos-concurrency-test-key";

  const { default: pool } = await import("../../src/config/database.js");
  const { paymentService, createPaymentService } = await import("../../src/services/payment.service.js");
  const { orderService } = await import("../../src/services/order.service.js");
  const { orderRepository } = await import("../../src/repositories/order.repository.js");
  const { paymentRepository } = await import("../../src/repositories/payment.repository.js");
  const { notificationOutboxService } = await import("../../src/services/notification-outbox.service.js");

  const fixturePrefix = `PAYOS-CONC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
  const fixtures = [];

  const createFixture = async (suffix) => {
    const client = await pool.connect();
    const orderCode = `${fixturePrefix}-${suffix}`;
    const payosOrderCode = Number(`${Date.now().toString().slice(-7)}${suffix}`);
    try {
      await client.query("BEGIN");
      const orderResult = await client.query(
        `INSERT INTO "order"
          (order_code, email_order, phone_order, status_order, total_order)
         VALUES ($1, $2, $3, 'pending', $4)
         RETURNING order_id, order_code, email_order, phone_order, status_order, total_order`,
        [orderCode, `${orderCode.toLowerCase()}@test.local`, "0900000000", 500000],
      );
      const order = orderResult.rows[0];
      const paymentResult = await client.query(
        `INSERT INTO payment
          (order_id, payment_method, status_payment, amount_payment, payos_order_code, payos_payment_link_id)
         VALUES ($1, 'payos', 'pending', $2, $3, $4)
         RETURNING payment_id, order_id, payment_method, status_payment, amount_payment, payos_order_code, payos_payment_link_id`,
        [order.order_id, 500000, payosOrderCode, `${orderCode}-link`],
      );
      await client.query("COMMIT");
      const fixture = { order, payment: paymentResult.rows[0] };
      fixtures.push(fixture);
      return fixture;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  const webhookFor = (fixture) => {
    const data = {
      orderCode: Number(fixture.payment.payos_order_code),
      amount: 500000,
      paymentLinkId: fixture.payment.payos_payment_link_id,
      reference: `REF-${fixture.payment.payment_id}`,
      code: "00",
    };
    return { code: "00", success: true, data, signature: createPayOSSignature(data, checksumKey) };
  };

  const readState = async (orderId) => {
    const { rows } = await pool.query(
      `SELECT o.status_order, p.status_payment
       FROM "order" o
       JOIN payment p ON p.order_id = o.order_id
       WHERE o.order_id = $1`,
      [orderId],
    );
    return rows[0];
  };

  const holdOrderLock = async (orderId) => {
    const client = await pool.connect();
    await client.query("BEGIN");
    await client.query('SELECT order_id FROM "order" WHERE order_id = $1 FOR UPDATE', [orderId]);
    return async () => {
      await client.query("COMMIT");
      client.release();
    };
  };

  const waitForLockWait = async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { rows } = await pool.query(
        "SELECT 1 FROM pg_locks WHERE NOT granted AND locktype IN ('tuple', 'transactionid') LIMIT 1",
      );
      if (rows.length) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected a transaction to wait on the held order lock");
  };

  const readNotificationCounts = async (orderId) => {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM notification_outbox WHERE dedupe_key = $1) AS email_count,
         (SELECT COUNT(*)::int FROM admin_notification WHERE entity_type = 'order' AND entity_id = $2) AS admin_count`,
      [`payment-succeeded:email:${orderId}`, orderId],
    );
    return rows[0];
  };

  test("cancellation wins the lock race and late payment cannot resurrect the order", async () => {
    const fixture = await createFixture("race");
    const releaseLock = await holdOrderLock(fixture.order.order_id);
    const cancellation = orderService.cancelGuestOrder(fixture.order.order_code, {
      email: fixture.order.email_order,
      phone: fixture.order.phone_order,
    });
    await waitForLockWait();
    const webhook = paymentService.handlePayOSWebhook(webhookFor(fixture));
    await new Promise((resolve) => setTimeout(resolve, 25));
    await releaseLock();
    const results = await Promise.allSettled([webhook, cancellation]);

    const unexpected = results.filter((result) => result.status === "rejected" && ![
      "PAID_ORDER_CANNOT_BE_DIRECTLY_CANCELLED",
    ].includes(result.reason?.code));
    assert.equal(unexpected.length, 0, unexpected.map((result) => result.reason?.message).join("; "));

    const state = await readState(fixture.order.order_id);
    assert.equal(state.status_order, "cancelled");
    assert.equal(state.status_payment, "paid");
  });

  test("webhook wins the lock race and cancellation cannot undo payment", async () => {
    const fixture = await createFixture("webhook-first");
    const releaseLock = await holdOrderLock(fixture.order.order_id);
    const webhook = paymentService.handlePayOSWebhook(webhookFor(fixture));
    await waitForLockWait();
    const cancellation = orderService.cancelGuestOrder(fixture.order.order_code, {
      email: fixture.order.email_order,
      phone: fixture.order.phone_order,
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    await releaseLock();
    const results = await Promise.allSettled([webhook, cancellation]);

    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "rejected");
    assert.equal(results[1].reason?.code, "PAID_ORDER_CANNOT_BE_DIRECTLY_CANCELLED");

    const state = await readState(fixture.order.order_id);
    assert.equal(state.status_order, "confirmed");
    assert.equal(state.status_payment, "paid");
  });

  test("duplicate webhook and polling settle once with no duplicate payment state", async () => {
    const fixture = await createFixture("duplicate");
    const pollingService = createPaymentService({
      payos: {
        get: async () => ({
          status: "PAID",
          amountPaid: 500000,
          orderCode: Number(fixture.payment.payos_order_code),
          paymentLinkId: fixture.payment.payos_payment_link_id,
          transactions: [{ reference: `REF-${fixture.payment.payment_id}` }],
        }),
      },
      orders: orderRepository,
      payments: paymentRepository,
      notifications: notificationOutboxService,
    });

    const webhook = paymentService.handlePayOSWebhook(webhookFor(fixture));
    const polling = pollingService.getOrderPaymentStatus(fixture.order.order_id, {
      email: fixture.order.email_order,
      phone: fixture.order.phone_order,
    });
    const results = await Promise.allSettled([webhook, polling]);
    const unexpected = results.filter((result) => result.status === "rejected");
    assert.equal(unexpected.length, 0, unexpected.map((result) => result.reason?.message).join("; "));

    const state = await readState(fixture.order.order_id);
    assert.equal(state.status_order, "confirmed");
    assert.equal(state.status_payment, "paid");
    const notifications = await readNotificationCounts(fixture.order.order_id);
    assert.equal(notifications.email_count, 1);
    assert.equal(notifications.admin_count, 0);
  });

  after(async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const fixture of fixtures) {
        await client.query("DELETE FROM notification_outbox WHERE payload->>'order_id' = $1", [String(fixture.order.order_id)]);
        await client.query("DELETE FROM admin_notification WHERE entity_type = 'order' AND entity_id = $1", [fixture.order.order_id]);
        await client.query("DELETE FROM \"order\" WHERE order_id = $1", [fixture.order.order_id]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
