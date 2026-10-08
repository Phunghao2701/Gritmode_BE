import { AppError, conflict, notFound, badRequest } from "../errors/app-error.js";
import { paymentRepository } from "../repositories/payment.repository.js";
import { orderRepository } from "../repositories/order.repository.js";
import {
  generatePayOSOrderCode,
  verifyPayOSWebhookSignature,
  callPayOSCreatePaymentLink,
  getPayOSPaymentLinkInfo,
} from "../utils/payos.js";
import { withTransaction } from "../config/database.js";
import { notificationOutboxService } from "./notification-outbox.service.js";
import { verifyOrderDetailToken } from "../utils/order-detail-link.js";

const VALID_COD_TRANSITIONS = {
  pending: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export const createPaymentService = ({
  payments = paymentRepository,
  orders = orderRepository,
  checksumKey = process.env.PAYOS_CHECKSUM_KEY,
  payos = {
    create: callPayOSCreatePaymentLink,
    get: getPayOSPaymentLinkInfo,
  },
  notifications = null,
  transaction = withTransaction,
} = {}) => {
  const runInTransaction = (callback, client) => (client ? callback(client) : transaction(callback));

  const toSettlementAck = ({ payment, order, reviewRequired = false }) => ({
    acknowledged: true,
    payment_id: Number(payment.payment_id),
    order_id: Number(payment.order_id),
    status_payment: payment.status_payment,
    status_order: order?.status_order || null,
    review_required: reviewRequired,
  });

  const assertWebhookProviderResult = (webhookPayload, payment) => {
    const data = webhookPayload?.data;
    if (
      webhookPayload?.code !== "00" ||
      webhookPayload?.success !== true ||
      (data?.code !== undefined && data.code !== "00")
    ) {
      throw badRequest("INVALID_WEBHOOK_STATUS", "Webhook PayOS chưa xác nhận giao dịch thành công");
    }

    const amount = Number(data?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || Number(payment.amount_payment) !== amount) {
      throw badRequest("AMOUNT_MISMATCH", "Số tiền thanh toán webhook không khớp với số tiền đơn hàng");
    }

    if (Number(payment.payos_order_code) !== Number(data.orderCode)) {
      throw badRequest("PAYOS_IDENTITY_MISMATCH", "Webhook PayOS không khớp mã đơn thanh toán");
    }

    if (
      data.paymentLinkId !== undefined &&
      data.paymentLinkId !== null &&
      payment.payos_payment_link_id &&
      String(payment.payos_payment_link_id) !== String(data.paymentLinkId)
    ) {
      throw badRequest("PAYOS_IDENTITY_MISMATCH", "Webhook PayOS không khớp payment link");
    }

    return amount;
  };

  const assertPollingProviderResult = (payosInfo, payment) => {
    if (!payosInfo || payosInfo.status !== "PAID") return null;

    const amount = Number(payosInfo.amountPaid);
    if (!Number.isFinite(amount) || amount <= 0 || Number(payment.amount_payment) !== amount) {
      throw badRequest("AMOUNT_MISMATCH", "Số tiền thanh toán PayOS không khớp với số tiền đơn hàng");
    }

    const providerOrderCode = payosInfo.orderCode ?? payosInfo.order_code;
    if (
      providerOrderCode === undefined ||
      Number(providerOrderCode) !== Number(payment.payos_order_code)
    ) {
      throw badRequest("PAYOS_IDENTITY_MISMATCH", "Trạng thái PayOS không khớp mã đơn thanh toán");
    }

    // The PayOS create endpoint returns `paymentLinkId`, while the
    // get-payment-request endpoint returns the same identifier as `id`.
    const providerLinkId = payosInfo.paymentLinkId ?? payosInfo.payment_link_id ?? payosInfo.id;
    if (
      providerLinkId === undefined ||
      !payment.payos_payment_link_id ||
      String(providerLinkId) !== String(payment.payos_payment_link_id)
    ) {
      throw badRequest("PAYOS_IDENTITY_MISMATCH", "Trạng thái PayOS không khớp payment link");
    }

    return amount;
  };

  const settlePayOSPayment = async ({
    payosOrderCode,
    amount,
    reference = null,
    client,
  }) => runInTransaction(async (tx) => {
    const paymentForLock = await payments.findByPayOSOrderCode(payosOrderCode, tx);
    if (!paymentForLock) {
      throw notFound("PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán cho mã orderCode này");
    }

    const lockedOrder = await orders.lockOrderById(paymentForLock.order_id, tx);
    if (!lockedOrder) {
      throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
    }

    const payment = await payments.findByPayOSOrderCode(payosOrderCode, tx);
    if (!payment || Number(payment.order_id) !== Number(lockedOrder.order_id)) {
      throw notFound("PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán cho mã orderCode này");
    }

    if (payment.payment_method !== "payos") {
      throw conflict("INVALID_PAYMENT_METHOD", "Thanh toán không phải PayOS");
    }

    if (Number(payment.amount_payment) !== Number(amount)) {
      throw badRequest("AMOUNT_MISMATCH", "Số tiền thanh toán PayOS không khớp với số tiền đơn hàng");
    }

    if (payment.status_payment === "paid") {
      return toSettlementAck({ payment, order: lockedOrder });
    }

    if (!["pending", "cancelled"].includes(payment.status_payment)) {
      throw conflict("PAYMENT_CANNOT_BE_SETTLED", `Không thể ghi nhận thanh toán ở trạng thái ${payment.status_payment}`);
    }

    const updated = await payments.markPayOSAsPaid({ paymentId: payment.payment_id, reference }, tx);
    if (!updated) {
      const current = await payments.findByPayOSOrderCode(payosOrderCode, tx);
      if (current?.status_payment === "paid") {
        return toSettlementAck({ payment: current, order: lockedOrder });
      }
      throw conflict("PAYMENT_CANNOT_BE_SETTLED", "Thanh toán đã thay đổi trạng thái, vui lòng thử lại");
    }

    const isLateSettlement = payment.status_payment === "cancelled" || lockedOrder.status_order === "cancelled";
    let finalOrder = lockedOrder;

    if (!isLateSettlement && lockedOrder.status_order === "pending") {
      finalOrder = await orders.updateOrderStatus(lockedOrder.order_id, "confirmed", tx);
    }

    if (isLateSettlement) {
      if (!notifications?.enqueuePayOSLatePaymentReview) {
        throw new AppError(500, "NOTIFICATION_OUTBOX_UNAVAILABLE", "Notification outbox chưa được cấu hình");
      }
      await notifications.enqueuePayOSLatePaymentReview({ order: lockedOrder, payment: updated, client: tx });
    } else {
      if (!notifications?.enqueuePaymentConfirmation) {
        throw new AppError(500, "NOTIFICATION_OUTBOX_UNAVAILABLE", "Notification outbox chưa được cấu hình");
      }
      await notifications.enqueuePaymentConfirmation({
        order: { ...finalOrder, payment: updated },
        payment: updated,
        client: tx,
      });
    }

    return toSettlementAck({ payment: updated, order: finalOrder, reviewRequired: isLateSettlement });
  }, client);
  const assertOrderAccess = (order, user, guestInfo = {}, detailToken = null) => {
    const detailAccess = detailToken ? verifyOrderDetailToken(detailToken) : null;
    if (
      detailAccess &&
      detailAccess.orderId === Number(order.order_id) &&
      detailAccess.orderCode === order.order_code
    ) {
      return;
    }

    if (order.user_id) {
      if (!user?.user_id || order.user_id !== user.user_id) {
        throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
      }
      return;
    }

    const guestEmail = String(guestInfo.email || "").trim().toLowerCase();
    const guestPhone = String(guestInfo.phone || "").replace(/\D/g, "").replace(/^84/, "0");
    const orderPhone = String(order.phone_order || "").replace(/\D/g, "").replace(/^84/, "0");
    if (!guestEmail || !guestPhone || guestEmail !== String(order.email_order || "").trim().toLowerCase() || guestPhone !== orderPhone) {
      throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
    }
  };

  return {
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
    const existing = await payments.findActivePaymentByOrderId(order.order_id, client);

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

    return payments.completeCodPayment(orderId, client);
  },

  /**
   * Cancel COD payment when order is cancelled
   */
  async cancelCodPayment(orderId, client) {
    const payment = await payments.findByOrderId(orderId, client);
    if (!payment) return null;

    if (payment.payment_method === "cod" && payment.status_payment === "pending") {
      return payments.cancelCodPayment(orderId, client);
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
    assertOrderAccess(order, user, guestInfo);

    if (order.status_order !== "pending") {
      throw conflict("ORDER_CANNOT_BE_PAID", `Không thể thanh toán đơn hàng đang ở trạng thái ${order.status_order}`);
    }

    const activePayment = await payments.findActivePaymentByOrderId(orderId, client);
    if (activePayment?.status_payment === "paid") {
      throw conflict("PAYMENT_ALREADY_PAID", "Đơn hàng đã được thanh toán thành công");
    }

    const now = new Date();
    if (
      activePayment?.status_payment === "pending" &&
      activePayment.expired_at &&
      new Date(activePayment.expired_at) > now
    ) {
      return activePayment;
    }

    // Create new payOS payment attempt
    const payosOrderCode = generatePayOSOrderCode();
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const payosResult = await payos.create({
      orderCode: payosOrderCode,
      amount: Number(order.total_order),
      description: `ORDER${order.order_id}`,
      orderId: order.order_id,
    });

    const checkoutUrl = payosResult?.checkoutUrl;
    const qrCode = payosResult?.qrCode;
    const paymentLinkId = payosResult?.paymentLinkId;
    if (!checkoutUrl || !qrCode || !paymentLinkId) {
      throw new AppError(502, "PAYOS_PROVIDER_FAILED", "PayOS trả về payment link không đầy đủ");
    }

    return runInTransaction(async (tx) => {
      const lockedOrder = await orders.lockOrderById(orderId, tx);
      if (!lockedOrder) {
        throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
      }

      assertOrderAccess(lockedOrder, user, guestInfo);
      if (lockedOrder.status_order !== "pending") {
        throw conflict("ORDER_CANNOT_BE_PAID", `Không thể thanh toán đơn hàng đang ở trạng thái ${lockedOrder.status_order}`);
      }

      const currentPayment = await payments.findActivePaymentByOrderId(orderId, tx);
      if (currentPayment?.status_payment === "paid") {
        throw conflict("PAYMENT_ALREADY_PAID", "Đơn hàng đã được thanh toán thành công");
      }

      if (
        currentPayment?.status_payment === "pending" &&
        currentPayment.expired_at &&
        new Date(currentPayment.expired_at) > new Date()
      ) {
        return currentPayment;
      }

      if (currentPayment?.status_payment === "pending" && payments.markPaymentExpired) {
        await payments.markPaymentExpired(currentPayment.payment_id, tx);
      }

      return payments.createPayment(
        {
          order_id: lockedOrder.order_id,
          payment_method: "payos",
          status_payment: "pending",
          amount_payment: Number(lockedOrder.total_order),
          payos_order_code: payosOrderCode,
          payos_payment_link_id: paymentLinkId,
          checkout_url: checkoutUrl,
          qr_code: qrCode,
          expired_at: expiredAt,
        },
        tx,
      );
    }, client);
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
    if (!Number.isFinite(payosOrderCode) || payosOrderCode <= 0) {
      throw badRequest("INVALID_WEBHOOK_PAYLOAD", "Webhook PayOS thiếu orderCode hợp lệ");
    }

    const payment = await payments.findByPayOSOrderCode(payosOrderCode, client);
    if (!payment) {
      throw notFound("PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán cho mã orderCode này");
    }

    const amount = assertWebhookProviderResult(webhookPayload, payment);
    if (payment.payment_method !== "payos") {
      throw conflict("INVALID_PAYMENT_METHOD", "Thanh toán không phải PayOS");
    }
    if (payment.status_payment === "paid") {
      return toSettlementAck({ payment, order: { status_order: null } });
    }

    return settlePayOSPayment({
      payosOrderCode,
      amount,
      reference: data.reference || data.paymentLinkId || null,
      client,
    });
  },

  /**
   * Get Order Payment Status (for polling)
   */
  async getOrderPaymentStatus(orderId, userOrGuest, client) {
    const order = await orders.findById(orderId, client);
    if (!order) {
      throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
    }

    assertOrderAccess(
      order,
      userOrGuest?.user_id ? userOrGuest : null,
      userOrGuest?.guestInfo || userOrGuest,
      userOrGuest?.detailToken,
    );

    let payment = await payments.findByOrderId(orderId, client);
    if (!payment) {
      throw notFound("PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán");
    }

    if (payment.status_payment === "paid") return payment;

    // Query PayOS outside the settlement transaction, then re-read current state after locking.
    if (
      payment.payment_method === "payos" &&
      ["pending", "cancelled"].includes(payment.status_payment) &&
      payment.payos_order_code
    ) {
      const payosInfo = await payos.get(payment.payos_order_code);
      const amount = assertPollingProviderResult(payosInfo, payment);
      if (amount !== null) {
        return settlePayOSPayment({
          payosOrderCode: payment.payos_order_code,
          amount,
          reference: payosInfo.transactions?.[0]?.reference || payosInfo.reference || payosInfo.id || null,
          client,
        });
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

    assertOrderAccess(order, userOrGuest?.user_id ? userOrGuest : null, userOrGuest?.guestInfo || userOrGuest);

    const initialPayment = await payments.findByOrderId(orderId, client);
    if (!initialPayment) {
      throw notFound("PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán");
    }

    if (initialPayment.payment_method !== "payos" || initialPayment.status_payment !== "pending") {
      throw conflict("CANNOT_CANCEL_PAYMENT", "Không thể hủy payment link ở trạng thái hiện tại");
    }

    return runInTransaction(async (tx) => {
      const lockedOrder = await orders.lockOrderById(orderId, tx);
      if (!lockedOrder) {
        throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
      }

      assertOrderAccess(lockedOrder, userOrGuest?.user_id ? userOrGuest : null, userOrGuest?.guestInfo || userOrGuest);

      const payment = await payments.findByOrderId(orderId, tx);
      if (!payment) {
        throw notFound("PAYMENT_NOT_FOUND", "Không tìm thấy thông tin thanh toán");
      }

      if (payment.payment_method !== "payos" || payment.status_payment !== "pending") {
        throw conflict("CANNOT_CANCEL_PAYMENT", "Không thể hủy payment link ở trạng thái hiện tại");
      }

      return payments.cancelPendingPayOSPaymentById(payment.payment_id, tx);
    }, client);
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

       const payosResult = await payos.create({
        orderCode: payosOrderCode,
        amount: Number(total),
        description: `ORDER${order.order_id}`,
        orderId: order.order_id,
      });

       const checkoutUrl = payosResult?.checkoutUrl;
       const qrCode = payosResult?.qrCode;
       const paymentLinkId = payosResult?.paymentLinkId;
       if (!checkoutUrl || !qrCode || !paymentLinkId) {
         throw new AppError(502, "PAYOS_PROVIDER_FAILED", "PayOS trả về payment link không đầy đủ");
       }

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

    throw badRequest("UNSUPPORTED_PAYMENT_METHOD", `Phương thức thanh toán không được hỗ trợ: ${paymentMethod}`);
  },
  };
};

const defaultPaymentService = createPaymentService({ notifications: notificationOutboxService });
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
