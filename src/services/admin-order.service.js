import { conflict, notFound } from "../errors/app-error.js";
import { orderRepository } from "../repositories/order.repository.js";
import { inventoryRepository } from "../repositories/inventory.repository.js";
import { paymentRepository } from "../repositories/payment.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";

export const createAdminOrderService = ({
  orders = orderRepository,
  inventories = inventoryRepository,
  payments = paymentRepository,
  audits = auditRepository,
  transaction = withTransaction,
} = {}) => {
  return {
    /**
     * Get paginated admin orders
     */
    async getOrders(filter = {}) {
      const page = Number(filter.page) || 1;
      const limit = Number(filter.limit) || 20;

      const [items, total] = await Promise.all([
        orders.findAdminOrders({ ...filter, page, limit }),
        orders.countAdminOrders(filter),
      ]);

      const totalPages = Math.ceil(total / limit) || 1;

      return {
        items: items.map((o) => ({
          order_id: Number(o.order_id),
          order_code: o.order_code,
          customer_type: o.customer_type,
          user_id: o.user_id,
          email_order: o.email_order,
          phone_order: o.phone_order,
          status_order: o.status_order,
          subtotal_order: Number(o.subtotal_order),
          discount_order: Number(o.discount_order),
          shipping_fee_order: Number(o.shipping_fee_order),
          total_order: Number(o.total_order),
          payment_method: o.payment_method || null,
          status_payment: o.status_payment || null,
          created_at: o.created_at,
          updated_at: o.updated_at,
        })),
        pagination: {
          page,
          limit,
          total,
          total_pages: totalPages,
        },
      };
    },

    /**
     * Get admin order detail
     */
    async getOrderById(orderId) {
      const order = await orders.findAdminOrderById(orderId);
      if (!order) {
        throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
      }
      return order;
    },

    /**
     * Confirm Order: pending -> confirmed
     */
    async confirmOrder(orderId, adminUserId) {
      return transaction(async (client) => {
        const order = await orders.lockOrderById(orderId, client);
        if (!order) {
          throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
        }

        if (order.status_order !== "pending") {
          throw conflict(
            "INVALID_ORDER_TRANSITION",
            `Không thể xác nhận đơn hàng đang ở trạng thái ${order.status_order}`,
            { current_status: order.status_order, requested_status: "confirmed" },
          );
        }

        const fullOrder = await orders.findAdminOrderById(orderId, client);
        if (fullOrder?.payment?.payment_method === "payos" && fullOrder?.payment?.status_payment !== "paid") {
          throw conflict(
            "PAYMENT_NOT_PAID",
            "Đơn hàng thanh toán trực tuyến payOS chưa được thanh toán",
          );
        }

        const updated = await orders.updateOrderStatus(orderId, "confirmed", client);

        if (audits?.log) {
          await audits.log(
            {
              userId: adminUserId,
              action: "ORDER_CONFIRMED",
              entityName: "order",
              entityId: String(orderId),
              oldData: { status_order: order.status_order },
              newData: { status_order: "confirmed" },
            },
            client,
          );
        }

        return {
          ...updated,
          order_id: Number(updated.order_id),
          status_order: "confirmed",
        };
      });
    },

    /**
     * Processing Order: confirmed -> processing
     */
    async processOrder(orderId, adminUserId) {
      return transaction(async (client) => {
        const order = await orders.lockOrderById(orderId, client);
        if (!order) {
          throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
        }

        if (order.status_order !== "confirmed") {
          throw conflict(
            "INVALID_ORDER_TRANSITION",
            `Không thể chuyển sang processing từ trạng thái ${order.status_order}`,
            { current_status: order.status_order, requested_status: "processing" },
          );
        }

        const updated = await orders.updateOrderStatus(orderId, "processing", client);

        if (audits?.log) {
          await audits.log(
            {
              userId: adminUserId,
              action: "ORDER_PROCESSING",
              entityName: "order",
              entityId: String(orderId),
              oldData: { status_order: order.status_order },
              newData: { status_order: "processing" },
            },
            client,
          );
        }

        return {
          ...updated,
          order_id: Number(updated.order_id),
          status_order: "processing",
        };
      });
    },

    /**
     * Shipping Order: processing -> shipping
     */
    async shipOrder(orderId, adminUserId) {
      return transaction(async (client) => {
        const order = await orders.lockOrderById(orderId, client);
        if (!order) {
          throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
        }

        if (order.status_order !== "processing") {
          throw conflict(
            "INVALID_ORDER_TRANSITION",
            `Không thể chuyển sang shipping từ trạng thái ${order.status_order}`,
            { current_status: order.status_order, requested_status: "shipping" },
          );
        }

        const updated = await orders.updateOrderStatus(orderId, "shipping", client);

        if (audits?.log) {
          await audits.log(
            {
              userId: adminUserId,
              action: "ORDER_SHIPPING",
              entityName: "order",
              entityId: String(orderId),
              oldData: { status_order: order.status_order },
              newData: { status_order: "shipping" },
            },
            client,
          );
        }

        return {
          ...updated,
          order_id: Number(updated.order_id),
          status_order: "shipping",
        };
      });
    },

    /**
     * Complete Order: shipping -> completed
     */
    async completeOrder(orderId, adminUserId) {
      return transaction(async (client) => {
        const order = await orders.lockOrderById(orderId, client);
        if (!order) {
          throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
        }

        if (order.status_order !== "shipping") {
          throw conflict(
            "INVALID_ORDER_TRANSITION",
            `Không thể hoàn thành đơn hàng đang ở trạng thái ${order.status_order}`,
            { current_status: order.status_order, requested_status: "completed" },
          );
        }

        const fullOrder = await orders.findAdminOrderById(orderId, client);
        if (fullOrder?.payment?.payment_method === "payos" && fullOrder?.payment?.status_payment !== "paid") {
          throw conflict(
            "PAYMENT_NOT_PAID",
            "Đơn hàng payOS chưa được thanh toán thành công",
          );
        }

        // 1. Commit reserved inventory (stock -= qty, reserved -= qty)
        const items = orders.findOrderItems
          ? await orders.findOrderItems(orderId, client)
          : fullOrder?.items || [];

        for (const item of items) {
          const qty = Number(item.quantity_order_item || item.quantity);
          if (item.product_variant_id && qty > 0) {
            await inventories.commitReservedStock(item.product_variant_id, qty, client);
          }
        }

        // 2. Mark COD as paid if applicable
        if (fullOrder?.payment?.payment_method === "cod" && payments.markCodAsPaid) {
          await payments.markCodAsPaid(orderId, client);
        }

        // 3. Update order status
        const updated = await orders.updateOrderStatus(orderId, "completed", client);

        // 4. Audit Log
        if (audits?.log) {
          await audits.log(
            {
              userId: adminUserId,
              action: "ORDER_COMPLETED",
              entityName: "order",
              entityId: String(orderId),
              oldData: { status_order: order.status_order },
              newData: { status_order: "completed" },
            },
            client,
          );
        }

        return {
          ...updated,
          order_id: Number(updated.order_id),
          status_order: "completed",
        };
      });
    },

    /**
     * Cancel Order (pending / confirmed / processing -> cancelled)
     */
    async cancelOrder(orderId, { reason, adminUserId } = {}) {
      return transaction(async (client) => {
        const order = await orders.lockOrderById(orderId, client);
        if (!order) {
          throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
        }

        if (!["pending", "confirmed", "processing"].includes(order.status_order)) {
          throw conflict(
            "INVALID_ORDER_TRANSITION",
            `Không thể hủy đơn hàng đang ở trạng thái ${order.status_order}`,
            { current_status: order.status_order, requested_status: "cancelled" },
          );
        }

        const fullOrder = await orders.findAdminOrderById(orderId, client);
        if (fullOrder?.payment?.payment_method === "payos" && fullOrder?.payment?.status_payment === "paid") {
          throw conflict(
            "PAID_ORDER_CANNOT_BE_DIRECTLY_CANCELLED",
            "Đơn hàng đã thanh toán trực tuyến không thể hủy trực tiếp, vui lòng thực hiện quy trình hoàn tiền",
          );
        }

        // 1. Release inventory reservation (reserved -= qty)
        const items = orders.findOrderItems
          ? await orders.findOrderItems(orderId, client)
          : fullOrder?.items || [];

        for (const item of items) {
          const qty = Number(item.quantity_order_item || item.quantity);
          if (item.product_variant_id && qty > 0) {
            await inventories.releaseReservedStock(item.product_variant_id, qty, client);
          }
        }

        // 2. Cancel pending payment
        if (payments.cancelPendingPaymentByOrderId) {
          await payments.cancelPendingPaymentByOrderId(orderId, client);
        }

        // 3. Update order status
        const updated = await orders.updateOrderStatus(orderId, "cancelled", client);

        // 4. Audit Log
        if (audits?.log) {
          await audits.log(
            {
              userId: adminUserId,
              action: "ORDER_CANCELLED",
              entityName: "order",
              entityId: String(orderId),
              oldData: { status_order: order.status_order },
              newData: { status_order: "cancelled", reason: reason || null },
            },
            client,
          );
        }

        return {
          ...updated,
          order_id: Number(updated.order_id),
          status_order: "cancelled",
        };
      });
    },
  };
};

const defaultAdminOrderService = createAdminOrderService();
export const adminOrderService = defaultAdminOrderService;
export const {
  getOrders,
  getOrderById,
  confirmOrder,
  processOrder,
  shipOrder,
  completeOrder,
  cancelOrder,
} = defaultAdminOrderService;
