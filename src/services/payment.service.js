import { conflict, notFound, badRequest } from "../errors/app-error.js";
import { paymentRepository } from "../repositories/payment.repository.js";
import { orderRepository } from "../repositories/order.repository.js";
import {
  generatePayOSOrderCode,
  verifyPayOSWebhookSignature,
  callPayOSCreatePaymentLink,
  getPayOSPaymentLinkInfo,
} from "../utils/payos.js";
import { emailService } from "./email.service.js";
import logger from "../utils/logger.js";

const VALID_COD_TRANSITIONS = {
  pending: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export const createPaymentService = ({
  payments = paymentRepository,
  orders = orderRepository,
  checksumKey = process.env.PAYOS_CHECKSUM_KEY,
  emails = emailService,
} = {}) => ({
  /**
   * Validate COD payment transition
   */
  validateCodPaymentTransition(currentStatus, nextStatus) {
    const allowed = VALID_COD_TRANSITIONS[currentStatus] || [];
    return allowed.includes(nextStatus);
  },

  /**
   * Get payment by order ID
   */
  async getOrderPayment(orderId, client) {
    return payments.findByOrderId(orderId, client);
  },

  /**
   * Create COD payment for order
   */
  async createCodPayment({ order, total }, client) {
    const existing = payments.findActivePaymentByOrderId
      ? await payments.findActivePaymentByOrderId(order.order_id, client)
      : null;

    if (existing) {
      return existing;
    }

    return payments.createPayment(
      {
        order_id: order.order_id,
        payment_method: "cod",
        status_payment: "pending",
        amount_payment: total,
      },
      client,
    );
  },

  /**
   * Complete COD payment when order is completed
   */
  async completeCodPayment(orderId, orderInfo = {}, client) {
    const payment = await payments.findByOrderId(orderId, client);
    if (!payment) {
      throw notFound("PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán");
    }

    if (payment.payment_method !== "cod") {
      throw conflict("INVALID_PAYMENT_METHOD", "Phương thức thanh toán không phải COD");
    }

    if (payment.status_payment !== "pending") {
      throw conflict(
        "INVALID_PAYMENT_STATUS",
        `Không thể hoàn tất thanh toán COD ở trạng thái ${payment.status_payment}`,
      );
    }

    if (orderInfo.total_order !== undefined && Number(payment.amount_payment) !== Number(orderInfo.total_order)) {
      throw conflict(
        "PAYMENT_AMOUNT_MISMATCH",
        "Số tiền thanh toán COD không khớp với tổng tiền đơn hàng",
      );
    }

    return payments.completeCodPayment
      ? payments.completeCodPayment(orderId, client)
      : payments.markCodAsPaid(orderId, client);
  },

  /**
   * Cancel COD payment when order is cancelled
   */
  async cancelCodPayment(orderId, client) {
    const payment = await payments.findByOrderId(orderId, client);
    if (!payment) return null;

    if (payment.payment_method === "cod" && payment.status_payment === "pending") {
      return payments.cancelCodPayment
        ? payments.cancelCodPayment(orderId, client)
        : payments.cancelPendingPaymentByOrderId(orderId, client);
    }
    return payment;
  },

  /**
   * Create / Retry payOS Payment Link
   */
  async createPayOSPayment({ orderId, user, guestInfo = {} }, client) {
    const order = await orders.findById(orderId, client);
    if (!order) {
      throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
    }

    // Verify ownership
    if (order.user_id && user && order.user_id !== user.user_id) {
      throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
    }

    if (order.status_order !== "pending") {
      throw conflict("ORDER_CANNOT_BE_PAID", `Không thể thanh toán đơn hàng đang ở trạng thái ${order.status_order}`);
    }

    // Check active payment attempt
    const activePayment = payments.findActivePaymentByOrderId
      ? await payments.findActivePaymentByOrderId(orderId, client)
      : await payments.findByOrderId(orderId, client);

    if (activePayment) {
      if (activePayment.status_payment === "paid") {
        throw conflict("PAYMENT_ALREADY_PAID", "Đơn hàng đã được thanh toán thành công");
      }

      // Check if current attempt is still valid (not expired)
      const now = new Date();
      if (activePayment.status_payment === "pending" && activePayment.expired_at && new Date(activePayment.expired_at) > now) {
        return activePayment;
      }

      // If expired, mark as expired before creating new attempt
      if (activePayment.status_payment === "pending" && activePayment.expired_at && new Date(activePayment.expired_at) <= now) {
        if (payments.markPaymentExpired) {
          await payments.markPaymentExpired(activePayment.payment_id, client);
        }
      }
    }

    // Create new payOS payment attempt
    const payosOrderCode = generatePayOSOrderCode();
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const payosResult = await callPayOSCreatePaymentLink({
      orderCode: payosOrderCode,
      amount: Number(order.total_order),
      description: `ORDER${order.order_id}`,
    });

    const checkoutUrl = payosResult?.checkoutUrl || `https://pay.payos.vn/web/${payosOrderCode}`;
    const qrCode = payosResult?.qrCode || `00020101021238540010A000000727012400069704220110${payosOrderCode}520459995303704540${order.total_order}5802VN62150811ORDER${order.order_id}6304`;
    const paymentLinkId = payosResult?.paymentLinkId || `link_${payosOrderCode}`;

    return payments.createPayment(
      {
        order_id: order.order_id,
        payment_method: "payos",
        status_payment: "pending",
        amount_payment: Number(order.total_order),
        payos_order_code: payosOrderCode,
        payos_payment_link_id: paymentLinkId,
        checkout_url: checkoutUrl,
        qr_code: qrCode,
        expired_at: expiredAt,
      },
      client,
    );
  },

  /**
   * Handle incoming payOS Webhook
   */
  async handlePayOSWebhook(webhookPayload = {}, client) {
    const isValid = verifyPayOSWebhookSignature(webhookPayload, checksumKey);
    if (!isValid) {
      throw badRequest("INVALID_WEBHOOK_SIGNATURE", "Chữ ký webhook payOS không hợp lệ");
    }

    const { data } = webhookPayload;
    const payosOrderCode = Number(data.orderCode);

    const payment = await payments.findByPayOSOrderCode(payosOrderCode, client);
    if (!payment) {
      throw notFound("PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán cho mã orderCode này");
    }

    // Validate amount
    if (data.amount !== undefined && Number(payment.amount_payment) !== Number(data.amount)) {
      throw badRequest("AMOUNT_MISMATCH", "Số tiền thanh toán webhook không khớp với số tiền đơn hàng");
    }

    // Idempotent: if already paid, return existing
    if (payment.status_payment === "paid") {
      return payment;
    }

    if (orders?.updateOrderStatus) {
      await orders.updateOrderStatus(payment.order_id, "confirmed", client);
    }

    const updated = await payments.markPayOSAsPaid(
      {
        paymentId: payment.payment_id,
        reference: data.reference || data.paymentLinkId || null,
      },
      client,
    );
    const order = orders.findAdminOrderById
      ? await orders.findAdminOrderById(payment.order_id, client)
      : orders.findById
        ? await orders.findById(payment.order_id, client)
        : null;
    if (order) {
      void emails.sendOrderConfirmationEmail({ ...order, payment: updated }).catch((error) => {
        logger.error(`[payment] Confirmation email failed for ${order.order_code}`, error);
      });
    }
    return updated;
  },

  /**
   * Get Order Payment Status (for polling)
   */
  async getOrderPaymentStatus(orderId, userOrGuest, client) {
    const order = await orders.findById(orderId, client);
    if (!order) {
      throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
    }

    if (order.user_id && userOrGuest?.user_id && order.user_id !== userOrGuest.user_id) {
      throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
    }

    let payment = await payments.findByOrderId(orderId, client);
    if (!payment) {
      throw notFound("PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán");
    }

    // Auto-sync with payOS if still pending (Supports local testing without Webhook)
    if (
      payment.payment_method === "payos" &&
      payment.status_payment === "pending" &&
      payment.payos_order_code
    ) {
      try {
        const payosInfo = await getPayOSPaymentLinkInfo(payment.payos_order_code);
        if (
          payosInfo &&
          (payosInfo.status === "PAID" || Number(payosInfo.amountPaid) >= Number(payment.amount_payment))
        ) {
          const updated = await payments.markPayOSAsPaid(
            {
              paymentId: payment.payment_id,
              reference: payosInfo.transactions?.[0]?.reference || payosInfo.id || null,
            },
            client,
          );
          if (orders?.updateOrderStatus) {
            await orders.updateOrderStatus(order.order_id, "confirmed", client);
          }
          if (updated) {
            payment = updated;
          }
        }
      } catch (syncErr) {
        // Fallback gracefully to current DB state
      }
    }

    return payment;
  },

  /**
   * Cancel pending payOS Payment Link
   */
  async cancelPayOSPaymentLink(orderId, userOrGuest, client) {
    const order = await orders.findById(orderId, client);
    if (!order) {
      throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
    }

    if (order.user_id && userOrGuest?.user_id && order.user_id !== userOrGuest.user_id) {
      throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
    }

    const payment = await payments.findByOrderId(orderId, client);
    if (!payment) {
      throw notFound("PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán");
    }

    if (payment.payment_method !== "payos" || payment.status_payment !== "pending") {
      throw conflict("CANNOT_CANCEL_PAYMENT", "Không thể hủy payment link ở trạng thái hiện tại");
    }

    return payments.cancelPendingPaymentByOrderId(orderId, client);
  },

  /**
   * Create payment for order (Generic router)
   */
  async createPayment({ order, paymentMethod, total }, client) {
    if (paymentMethod === "cod") {
      return this.createCodPayment({ order, total }, client);
    }

    if (paymentMethod === "payos") {
      const payosOrderCode = generatePayOSOrderCode();
      const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      const payosResult = await callPayOSCreatePaymentLink({
        orderCode: payosOrderCode,
        amount: Number(total),
        description: `ORDER${order.order_id}`,
      });

      const checkoutUrl = payosResult?.checkoutUrl || `https://pay.payos.vn/web/${payosOrderCode}`;
      const qrCode = payosResult?.qrCode || `00020101021238540010A000000727012400069704220110${payosOrderCode}520459995303704540${total}5802VN62150811ORDER${order.order_id}6304`;
      const paymentLinkId = payosResult?.paymentLinkId || `link_${payosOrderCode}`;

      return payments.createPayment(
        {
          order_id: order.order_id,
          payment_method: "payos",
          status_payment: "pending",
          amount_payment: total,
          payos_order_code: payosOrderCode,
          payos_payment_link_id: paymentLinkId,
          checkout_url: checkoutUrl,
          qr_code: qrCode,
          expired_at: expiredAt,
        },
        client,
      );
    }
  },
});

const defaultPaymentService = createPaymentService();
export const paymentService = defaultPaymentService;
export const {
  createPayment,
  createCodPayment,
  completeCodPayment,
  cancelCodPayment,
  createPayOSPayment,
  handlePayOSWebhook,
  getOrderPaymentStatus,
  cancelPayOSPaymentLink,
  getOrderPayment,
  validateCodPaymentTransition,
} = defaultPaymentService;
