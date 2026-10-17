import { conflict, notFound } from "../errors/app-error.js";
import { orderRepository } from "../repositories/order.repository.js";
import { paymentRepository } from "../repositories/payment.repository.js";
import { inventoryRepository } from "../repositories/inventory.repository.js";
import { refundRequestRepository } from "../repositories/refund-request.repository.js";
import { adminNotificationRepository } from "../repositories/admin-notification.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";
import { realtimeBus } from "./realtime-bus.service.js";

const CUSTOMER_REFUNDABLE_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipping",
  "completed",
  "cancelled",
];

const normalizeRefundRequest = (request) => {
  if (!request) return null;
  return {
    ...request,
    refund_request_id: Number(request.refund_request_id),
    order_id: Number(request.order_id),
    payment_id: Number(request.payment_id),
  };
};

const normalizeAdminRefundRequest = (request) => ({
  ...normalizeRefundRequest(request),
  total_order: Number(request.total_order || 0),
});

export const createRefundService = ({
  orders = orderRepository,
  payments = paymentRepository,
  inventories = inventoryRepository,
  refundRequests = refundRequestRepository,
  adminNotifications = adminNotificationRepository,
  audits = auditRepository,
  realtime = realtimeBus,
  transaction = withTransaction,
} = {}) => {
  const publishOrderUpdated = (order, previousStatus) => {
    if (!realtime?.publish || !order) return;
    realtime.publish({
      type: "admin.order.updated",
      data: {
        order_id: Number(order.order_id),
        order_code: order.order_code,
        previous_status_order: previousStatus,
        status_order: order.status_order,
        refund_status: order.refund_request?.status_refund_request || null,
      },
    });
  };

  const assertPaidPayOSPayment = (payment) => {
    if (payment?.payment_method !== "payos" || payment.status_payment !== "paid") {
      throw conflict(
        "REFUND_NOT_AVAILABLE",
        "Chỉ có thể yêu cầu hoàn tiền cho đơn hàng PayOS đã thanh toán",
      );
    }
  };

  const assertCustomerAccess = (order, { userId, userEmail, guestInfo } = {}) => {
    if (userId) {
      const isOwnedOrder = order.user_id && String(order.user_id) === String(userId);
      const isLegacyGuestOrder = !order.user_id
        && String(order.email_order || "").trim().toLowerCase() === String(userEmail || "").trim().toLowerCase();
      if (!isOwnedOrder && !isLegacyGuestOrder) {
        throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
      }
      return;
    }

    const email = String(guestInfo?.email || "").trim().toLowerCase();
    const phone = String(guestInfo?.phone || "").trim();
    if (
      !email ||
      !phone ||
      String(order.email_order || "").trim().toLowerCase() !== email ||
      String(order.phone_order || "").trim() !== phone
    ) {
      throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng phù hợp với thông tin xác thực");
    }
  };

  const createOrReuseRequest = async ({ order, payment, requesterUserId, requesterType, reason, client }) => {
    const existing = await refundRequests.findByOrderId(order.order_id, client);
    if (existing?.status_refund_request === "completed") {
      throw conflict("REFUND_ALREADY_COMPLETED", "Đơn hàng này đã được hoàn tiền");
    }

    if (existing?.status_refund_request === "pending" || existing?.status_refund_request === "processing") {
      return { request: existing, alreadyRequested: true };
    }

    const request = existing
      ? await refundRequests.reopen(existing.refund_request_id, { requesterUserId, requesterType, reason }, client)
      : await refundRequests.create({
        orderId: order.order_id,
        paymentId: payment.payment_id,
        requesterUserId,
        requesterType,
        reason,
      }, client);

    if (!request) {
      throw conflict("REFUND_REQUEST_CONFLICT", "Yêu cầu hoàn tiền vừa được tạo hoặc cập nhật, vui lòng thử lại");
    }

    if (adminNotifications?.create) {
      await adminNotifications.create(
        {
          eventType: "refund.requested",
          entityType: "order",
          entityId: order.order_id,
          dedupeKey: `refund-requested:admin:${request.refund_request_id}`,
          title: "Có yêu cầu hoàn tiền mới",
          body: `Đơn hàng ${order.order_code || order.order_id} cần được xử lý hoàn tiền.`,
          payload: {
            order_id: Number(order.order_id),
            order_code: order.order_code,
            refund_request_id: Number(request.refund_request_id),
            amount: Number(payment.amount_payment || order.total_order || 0),
          },
        },
        client,
      );
    }

    return { request, alreadyRequested: false };
  };

  const releaseOrderInventory = async (orderId, client) => {
    const items = await orders.findOrderItems(orderId, client);
    for (const item of items) {
      const quantity = Number(item.quantity_order_item || item.quantity || 0);
      if (item.product_variant_id && quantity > 0) {
        await inventories.releaseReservedStock(item.product_variant_id, quantity, client);
      }
    }
  };

  return {
    async requestRefund({ orderId, userId = null, userEmail = null, guestInfo = null, reason = null } = {}) {
      return transaction(async (client) => {
        const order = await orders.lockOrderById(orderId, client);
        if (!order) throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");

        assertCustomerAccess(order, { userId, userEmail, guestInfo });
        if (!CUSTOMER_REFUNDABLE_ORDER_STATUSES.includes(order.status_order)) {
          throw conflict(
            "REFUND_NOT_AVAILABLE",
            `Không thể yêu cầu hoàn tiền cho đơn hàng đang ở trạng thái ${order.status_order}`,
          );
        }

        const payment = await payments.findByOrderId(orderId, client);
        assertPaidPayOSPayment(payment);

        const { request, alreadyRequested } = await createOrReuseRequest({
          order,
          payment,
          requesterUserId: userId,
          requesterType: "customer",
          reason,
          client,
        });

        return {
          refund_request: normalizeRefundRequest(request),
          already_requested: alreadyRequested,
          status_order: order.status_order,
        };
      });
    },

    async requestGuestRefund(orderCode, { email, phone, reason } = {}) {
      return transaction(async (client) => {
        const candidate = await orders.findGuestOrder({ orderCode, email, phone }, client);
        if (!candidate) {
          throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng phù hợp với thông tin xác thực");
        }

        const order = await orders.lockOrderById(candidate.order_id, client);
        if (!order) throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
        assertCustomerAccess(order, { guestInfo: { email, phone } });
        if (!CUSTOMER_REFUNDABLE_ORDER_STATUSES.includes(order.status_order)) {
          throw conflict(
            "REFUND_NOT_AVAILABLE",
            `Không thể yêu cầu hoàn tiền cho đơn hàng đang ở trạng thái ${order.status_order}`,
          );
        }

        const payment = await payments.findByOrderId(order.order_id, client);
        assertPaidPayOSPayment(payment);
        const { request, alreadyRequested } = await createOrReuseRequest({
          order,
          payment,
          requesterUserId: null,
          requesterType: "customer",
          reason,
          client,
        });

        return {
          refund_request: normalizeRefundRequest(request),
          already_requested: alreadyRequested,
          status_order: order.status_order,
        };
      });
    },

    async getAdminRefundRequests({ status, page = 1, limit = 20 } = {}) {
      const [items, total] = await Promise.all([
        refundRequests.listAdmin({ status, page, limit }),
        refundRequests.countAdmin({ status }),
      ]);
      return {
        items: items.map(normalizeAdminRefundRequest),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          total_pages: Math.ceil(total / Number(limit)) || 1,
        },
      };
    },

    async completeRefund(refundRequestId, { adminUserId, providerReference, adminNote } = {}) {
      let previousStatus;
      const result = await transaction(async (client) => {
        const request = await refundRequests.lockById(refundRequestId, client);
        if (!request) throw notFound("REFUND_REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu hoàn tiền");
        if (request.status_refund_request === "completed") {
          return { refund_request: normalizeRefundRequest(request), already_completed: true };
        }
        if (!["pending", "processing"].includes(request.status_refund_request)) {
          throw conflict("REFUND_REQUEST_NOT_PROCESSABLE", "Yêu cầu hoàn tiền không còn ở trạng thái có thể xử lý");
        }

        const order = await orders.lockOrderById(request.order_id, client);
        if (!order) throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng của yêu cầu hoàn tiền");
        previousStatus = order.status_order;

        const payment = await payments.findByOrderId(request.order_id, client);
        if (!payment || Number(payment.payment_id) !== Number(request.payment_id)) {
          throw conflict("REFUND_PAYMENT_MISMATCH", "Thông tin thanh toán không khớp với yêu cầu hoàn tiền");
        }
        if (payment.status_payment !== "paid" && payment.status_payment !== "refunded") {
          throw conflict("REFUND_PAYMENT_NOT_PAID", "Khoản thanh toán chưa ở trạng thái đã thanh toán");
        }

        if (order.status_order !== "cancelled") {
          await releaseOrderInventory(order.order_id, client);
        }

        const refundedPayment = payment.status_payment === "refunded"
          ? payment
          : await payments.markRefunded(payment.payment_id, { providerReference }, client);
        if (!refundedPayment) {
          throw conflict("REFUND_PAYMENT_UPDATE_FAILED", "Không thể cập nhật trạng thái hoàn tiền");
        }

        const updatedOrder = order.status_order === "cancelled"
          ? order
          : await orders.updateOrderStatus(order.order_id, "cancelled", client);
        const updatedRequest = await refundRequests.markCompleted(
          refundRequestId,
          { processedBy: adminUserId, providerReference, adminNote },
          client,
        );
        if (!updatedRequest) {
          throw conflict("REFUND_REQUEST_UPDATE_FAILED", "Không thể cập nhật yêu cầu hoàn tiền");
        }

        if (audits?.log) {
          await audits.log(
            {
              userId: adminUserId,
              action: "REFUND_COMPLETED",
              entityName: "refund_request",
              entityId: String(refundRequestId),
              oldData: { status: request.status_refund_request },
              newData: { status: "completed", provider_reference: providerReference || null },
            },
            client,
          );
        }

        return {
          refund_request: normalizeRefundRequest(updatedRequest),
          order: { ...updatedOrder, order_id: Number(updatedOrder.order_id), status_order: "cancelled" },
          payment: refundedPayment,
        };
      });

      if (!result.already_completed) publishOrderUpdated(result.order, previousStatus);
      return result;
    },

    async attachRefundRequest(order, client) {
      if (!order?.order_id) return order;
      const request = await refundRequests.findByOrderId(order.order_id, client);
      return { ...order, refund_request: normalizeRefundRequest(request) };
    },

    async createAdminCancellationRefundRequest({ order, payment, adminUserId, reason, client }) {
      assertPaidPayOSPayment(payment);
      const { request } = await createOrReuseRequest({
        order,
        payment,
        requesterUserId: adminUserId,
        requesterType: "admin",
        reason,
        client,
      });
      return normalizeRefundRequest(request);
    },
  };
};

const defaultRefundService = createRefundService();
export const refundService = defaultRefundService;
export const {
  requestRefund,
  requestGuestRefund,
  getAdminRefundRequests,
  completeRefund,
} = defaultRefundService;
