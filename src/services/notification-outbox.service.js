import { notificationOutboxRepository } from "../repositories/notification-outbox.repository.js";
import { adminNotificationRepository } from "../repositories/admin-notification.repository.js";

const orderSummary = (order) => ({
  order_id: Number(order.order_id),
  order_code: order.order_code,
  total_order: Number(order.total_order || 0),
  status_order: order.status_order,
  payment_method: order.payment?.payment_method || null,
});

export const createNotificationOutboxService = ({
  outbox = notificationOutboxRepository,
  adminNotifications = adminNotificationRepository,
} = {}) => ({
  async enqueueOrderCreated({ order, client }) {
    const summary = orderSummary(order);
    const adminNotification = await adminNotifications.create(
      {
        eventType: "order.created",
        entityType: "order",
        entityId: order.order_id,
        dedupeKey: `order-created:admin:${order.order_id}`,
        title: "Có đơn hàng mới",
        body: `Đơn hàng ${order.order_code} vừa được tạo.`,
        payload: summary,
      },
      client,
    );

    let emailOutbox = null;
    if (order.payment?.payment_method === "cod" && order.email_order) {
      emailOutbox = await outbox.enqueue(
        {
          channel: "email",
          eventType: "order.created.email",
          destination: order.email_order,
          dedupeKey: `order-created:email:${order.order_id}`,
          payload: { order_id: order.order_id, order_code: order.order_code },
        },
        client,
      );
    }

    return { adminNotification, emailOutbox };
  },

  async enqueuePaymentConfirmation({ order, payment, client }) {
    if (!order?.email_order) return null;

    return outbox.enqueue(
      {
        channel: "email",
        eventType: "payment.succeeded.email",
        destination: order.email_order,
        dedupeKey: `payment-succeeded:email:${order.order_id}`,
        payload: {
          order_id: order.order_id,
          order_code: order.order_code,
          payment_id: payment?.payment_id || null,
        },
      },
      client,
    );
  },
});

export const notificationOutboxService = createNotificationOutboxService();
