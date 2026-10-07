import { withTransaction } from "../config/database.js";
import { notificationOutboxRepository } from "../repositories/notification-outbox.repository.js";
import { orderRepository } from "../repositories/order.repository.js";
import { emailService } from "./email.service.js";
import logger from "../utils/logger.js";

const MAX_ATTEMPTS = Math.max(1, Number(process.env.NOTIFICATION_MAX_ATTEMPTS) || 5);
const MAX_BACKOFF_MS = 60 * 60 * 1000;

const getNextAttemptAt = (attemptCount) => {
  const backoffMs = Math.min(5 * 60 * 1000 * (2 ** Math.max(0, attemptCount - 1)), MAX_BACKOFF_MS);
  return new Date(Date.now() + backoffMs);
};

export const createNotificationDispatcher = ({
  outbox = notificationOutboxRepository,
  orders = orderRepository,
  emails = emailService,
  transaction = withTransaction,
  log = logger,
} = {}) => {
  const processRow = async (row) => {
    if (row.channel !== "email") {
      throw new Error(`Unsupported notification channel: ${row.channel}`);
    }

    const orderId = row.payload?.order_id;
    const order = orderId ? await orders.findAdminOrderById(orderId) : null;

    if (!order) {
      throw new Error(`Order ${orderId || "unknown"} not found for notification ${row.notification_outbox_id}`);
    }

    await emails.sendOrderConfirmationEmail(
      {
        ...order,
        email_order: order.email_order || row.destination,
        payment: order.payment || null,
      },
      { idempotencyKey: `notification:${row.dedupe_key}` },
    );
  };

  const markSent = (id) => transaction((client) => outbox.markSent(id, client));
  const markFailed = (row, error) => {
    const deadLetter = Number(row.attempt_count) >= MAX_ATTEMPTS;
    return transaction((client) => outbox.markFailed(
      row.notification_outbox_id,
      {
        error: error?.message || error,
        deadLetter,
        nextAttemptAt: deadLetter ? null : getNextAttemptAt(Number(row.attempt_count) || 1),
      },
      client,
    ));
  };

  return {
    async processBatch({ limit = 10 } = {}) {
      const rows = await transaction((client) => outbox.claimBatch({ limit }, client));
      let sent = 0;
      let failed = 0;

      for (const row of rows) {
        try {
          await processRow(row);
          await markSent(row.notification_outbox_id);
          sent += 1;
        } catch (error) {
          failed += 1;
          await markFailed(row, error);
          log.error(`[notification] delivery failed for ${row.dedupe_key}`, error);
        }
      }

      return { claimed: rows.length, sent, failed };
    },

    processRow,
  };
};

export const notificationDispatcher = createNotificationDispatcher();

export const startNotificationWorker = ({
  dispatcher = notificationDispatcher,
  intervalMs = Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS) || 5000,
  log = logger,
} = {}) => {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await dispatcher.processBatch();
    } catch (error) {
      log.error("[notification] worker tick failed", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, Math.max(1000, intervalMs));
  void tick();

  return {
    stop() {
      clearInterval(timer);
    },
    runNow: tick,
  };
};
