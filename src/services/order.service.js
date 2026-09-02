import { randomInt } from "node:crypto";
import { AppError, badRequest, conflict, notFound } from "../errors/app-error.js";
import { cartRepository } from "../repositories/cart.repository.js";
import { inventoryRepository } from "../repositories/inventory.repository.js";
import { orderRepository } from "../repositories/order.repository.js";
import { addressRepository } from "../repositories/address.repository.js";
import { voucherRepository } from "../repositories/voucher.repository.js";
import { voucherService } from "./voucher.service.js";
import { paymentService } from "./payment.service.js";
import { withTransaction } from "../config/database.js";
import { emailService } from "./email.service.js";
import logger from "../utils/logger.js";

const DEFAULT_SHIPPING_FEE = 0;

export const createOrderService = ({
  carts = cartRepository,
  inventories = inventoryRepository,
  orders = orderRepository,
  addresses = addressRepository,
  vouchers = voucherService,
  voucherRepo = voucherRepository,
  payments = paymentService,
  emails = emailService,
  transaction = withTransaction,
} = {}) => {
  const generateOrderCode = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = randomInt(100000, 999999);
    return `ORD-${dateStr}-${randomSuffix}`;
  };

  return {
    /**
     * Checkout Cart & Create Order
     * @param {Object} input
     * @param {Object} context
     */
    async createOrder(input, context = {}) {
      const owner = context.owner || (context.user ? { type: "user", userId: context.user.user_id } : { type: "guest", guestToken: input.guest_token });

      const result = await transaction(async (client) => {
        // 1. Find active cart
        const cart = await carts.findActiveByOwner(owner, client);
        if (!cart || cart.status_cart !== "active") {
          throw notFound("CART_NOT_FOUND", "Không tìm thấy giỏ hàng khả dụng để đặt hàng");
        }

        // 2. Load and validate cart items
        const cartItems = await carts.getDetailedItems(cart.cart_id, client);
        if (!cartItems || cartItems.length === 0) {
          throw badRequest("CART_EMPTY", "Giỏ hàng của bạn đang trống");
        }

        // 3. Lock & Validate inventory for each item
        for (const item of cartItems) {
          const inv = inventories.lockStockByVariantId
            ? await inventories.lockStockByVariantId(item.product_variant_id, client)
            : await inventories.findByVariantId(item.product_variant_id, client);

          if (!inv) {
            throw notFound("INVENTORY_NOT_FOUND", `Không tìm thấy tồn kho cho sản phẩm ${item.name_product}`);
          }

          const available = Number(inv.quantity_available);
          const requested = Number(item.quantity ?? item.quantity_cart_item);

          if (requested > available) {
            throw new AppError(
              409,
              "INSUFFICIENT_STOCK",
              `Sản phẩm ${item.name_product} (${item.variant || item.sku}) không đủ số lượng tồn kho`,
              {
                product_variant_id: item.product_variant_id,
                requested_quantity: requested,
                available_quantity: available,
              },
            );
          }
        }

        // 4. Calculate subtotal
        const subtotal = cartItems.reduce((sum, item) => {
          const price = Number(item.price);
          const qty = Number(item.quantity ?? item.quantity_cart_item);
          return sum + price * qty;
        }, 0);

        // 5. Validate & Apply Voucher if provided
        let voucherId = null;
        let voucherCode = null;
        let discountAmount = 0;

        if (input.voucher_code) {
          const voucherResult = await vouchers.validateVoucher(
            {
              code_voucher: input.voucher_code,
              cart: { items: cartItems, subtotal },
            },
            { client },
          );

          if (voucherResult && voucherResult.voucher) {
            voucherId = voucherResult.voucher.voucher_id;
            voucherCode = voucherResult.voucher.code_voucher;
            discountAmount = Number(voucherResult.discount_amount || 0);

            // Increment voucher usage
            if (vouchers.incrementUsage) {
              await vouchers.incrementUsage(voucherId, client);
            } else if (voucherRepo.incrementUsage) {
              await voucherRepo.incrementUsage(voucherId, client);
            }
          }
        }

        // 6. Calculate shipping fee and total
        const shippingFee = DEFAULT_SHIPPING_FEE;
        const total = Math.max(0, subtotal - discountAmount + shippingFee);

        // 7. Resolve customer contact & address snapshot
        let emailOrder = input.email_order;
        let phoneOrder = input.phone_order;
        let receiverName = input.receiver_name_order_address;
        let phoneAddress = input.phone_order_address;
        let addressLine = input.address_line_order_address;
        let ward = input.ward_order_address;
        let district = input.district_order_address;
        let province = input.province_order_address;

        if (context.user) {
          emailOrder = emailOrder || context.user.email;
          phoneOrder = phoneOrder || context.user.phone || phoneAddress;

          if (input.user_address_id) {
            const savedAddr = await addresses.findById(input.user_address_id, context.user.user_id, client);
            if (!savedAddr) {
              throw notFound("ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ đã lưu");
            }
            receiverName = savedAddr.receiver_name_user_address || savedAddr.receiver_name;
            phoneAddress = savedAddr.phone_user_address || savedAddr.phone;
            addressLine = savedAddr.address_line_user_address || savedAddr.address_line;
            ward = savedAddr.ward_user_address || savedAddr.ward;
            district = savedAddr.district_user_address || savedAddr.district;
            province = savedAddr.province_user_address || savedAddr.province;
            phoneOrder = phoneOrder || phoneAddress;
          }
        }

        // 8. Generate Order Code & Create Order Record
        const orderCode = generateOrderCode();
        const createdOrder = await orders.createOrder(
          {
            order_code: orderCode,
            user_id: context.user ? context.user.user_id : null,
            cart_id: cart.cart_id,
            voucher_id: voucherId,
            code_voucher_order: voucherCode,
            email_order: emailOrder,
            phone_order: phoneOrder,
            status_order: "pending",
            subtotal_order: subtotal,
            discount_order: discountAmount,
            shipping_fee_order: shippingFee,
            total_order: total,
            note_order: input.note_order,
          },
          client,
        );

        // 9. Snapshot Order Items
        const orderItemsToInsert = cartItems.map((item) => {
          const price = Number(item.price);
          const qty = Number(item.quantity ?? item.quantity_cart_item);
          return {
            order_id: createdOrder.order_id,
            product_variant_id: item.product_variant_id,
            name_product_order_item: item.name_product,
            sku_order_item: item.sku,
            variant_order_item: item.variant || null,
            price_order_item: price,
            quantity_order_item: qty,
            total_order_item: price * qty,
          };
        });
        const createdItems = await orders.createOrderItems(orderItemsToInsert, client);

        // 10. Snapshot Order Address
        const createdAddress = await orders.createOrderAddress(
          {
            order_id: createdOrder.order_id,
            receiver_name_order_address: receiverName,
            phone_order_address: phoneAddress,
            address_line_order_address: addressLine,
            ward_order_address: ward,
            district_order_address: district,
            province_order_address: province,
          },
          client,
        );

        // 11. Reserve Inventory for each item
        for (const item of cartItems) {
          const qty = Number(item.quantity ?? item.quantity_cart_item);
          await inventories.reserveStock(item.product_variant_id, qty, client);
        }

        // 12. Create Payment
        const paymentResult = await payments.createPayment(
          {
            order: createdOrder,
            paymentMethod: input.payment_method,
            total,
          },
          client,
        );

        // 13. Convert Cart to 'converted'
        if (carts.updateStatus) {
          await carts.updateStatus(cart.cart_id, "converted", client);
        } else if (client.query) {
          await client.query(`UPDATE cart SET status_cart = 'converted', updated_at = NOW() WHERE cart_id = $1`, [cart.cart_id]);
        }

        return {
          ...createdOrder,
          order_id: Number(createdOrder.order_id),
          subtotal_order: Number(createdOrder.subtotal_order),
          discount_order: Number(createdOrder.discount_order),
          shipping_fee_order: Number(createdOrder.shipping_fee_order),
          total_order: Number(createdOrder.total_order),
          payment: paymentResult,
          items: createdItems.map((item, index) => ({ ...item, image_product: cartItems[index]?.image || null })),
          address: createdAddress,
        };
      });

      if (result.payment?.payment_method === "cod") {
        void emails.sendOrderConfirmationEmail(result).catch((error) => {
          logger.error(`[order] Confirmation email failed for ${result.order_code}`, error);
        });
      }
      return result;
    },

    /**
     * Get list of orders for authenticated user
     */
    async getUserOrders(userId, query = {}) {
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 10;
      const status_order = query.status_order;

      const [items, total] = await Promise.all([
        orders.findUserOrders({ userId, status_order, page, limit }),
        orders.countUserOrders({ userId, status_order }),
      ]);

      const totalPages = Math.ceil(total / limit) || 1;

      return {
        items: items.map((o) => ({
          order_id: Number(o.order_id),
          order_code: o.order_code,
          status_order: o.status_order,
          subtotal_order: Number(o.subtotal_order),
          discount_order: Number(o.discount_order),
          shipping_fee_order: Number(o.shipping_fee_order),
          total_order: Number(o.total_order),
          payment_method: o.payment_method || null,
          status_payment: o.status_payment || null,
          created_at: o.created_at,
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
     * Get order detail for authenticated user (Ownership enforced)
     */
    async getUserOrderById(orderId, userId) {
      const order = await orders.findUserOrderById(orderId, userId);
      if (!order) {
        throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
      }
      return order;
    },

    /**
     * Cancel order for authenticated user
     */
    async cancelUserOrder(orderId, userId) {
      const order = await orders.findUserOrderById(orderId, userId);
      if (!order) {
        throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng");
      }

      if (!["pending", "confirmed"].includes(order.status_order)) {
        throw conflict(
          "ORDER_CANNOT_BE_CANCELLED",
          `Không thể hủy đơn hàng đang ở trạng thái ${order.status_order}`,
        );
      }

      return transaction(async (client) => {
        // 1. Load items & release inventory reservations
        const items = orders.findOrderItems
          ? await orders.findOrderItems(orderId, client)
          : order.items || [];

        for (const item of items) {
          const qty = Number(item.quantity_order_item || item.quantity);
          if (item.product_variant_id && qty > 0) {
            await inventories.releaseReservedStock(item.product_variant_id, qty, client);
          }
        }

        // 2. Cancel pending payment if exists
        if (payments.cancelPendingPaymentByOrderId) {
          await payments.cancelPendingPaymentByOrderId(orderId, client);
        }

        // 3. Update order status to 'cancelled'
        const updated = await orders.updateOrderStatus(orderId, "cancelled", client);
        return {
          ...updated,
          order_id: Number(updated.order_id),
          status_order: "cancelled",
        };
      });
    },

    /**
     * Guest Order Lookup (Verify 3 fields: order_code, email, phone)
     */
    async lookupGuestOrder({ order_code, email, phone }) {
      const order = await orders.findGuestOrder({ orderCode: order_code, email, phone });
      if (!order) {
        throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng phù hợp với thông tin xác thực");
      }
      return order;
    },

    /**
     * Guest Cancel Order (Verify email + phone)
     */
    async cancelGuestOrder(orderCode, { email, phone }) {
      const order = await orders.findGuestOrder({ orderCode, email, phone });
      if (!order) {
        throw notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng phù hợp với thông tin xác thực");
      }

      if (!["pending", "confirmed"].includes(order.status_order)) {
        throw conflict(
          "ORDER_CANNOT_BE_CANCELLED",
          `Không thể hủy đơn hàng đang ở trạng thái ${order.status_order}`,
        );
      }

      return transaction(async (client) => {
        // 1. Release inventory reservations
        const items = orders.findOrderItems
          ? await orders.findOrderItems(order.order_id, client)
          : order.items || [];

        for (const item of items) {
          const qty = Number(item.quantity_order_item || item.quantity);
          if (item.product_variant_id && qty > 0) {
            await inventories.releaseReservedStock(item.product_variant_id, qty, client);
          }
        }

        // 2. Cancel pending payment
        if (payments.cancelPendingPaymentByOrderId) {
          await payments.cancelPendingPaymentByOrderId(order.order_id, client);
        }

        // 3. Update order status
        const updated = await orders.updateOrderStatus(order.order_id, "cancelled", client);
        return {
          ...updated,
          order_id: Number(updated.order_id),
          status_order: "cancelled",
        };
      });
    },
  };
};

const defaultOrderService = createOrderService();
export const orderService = defaultOrderService;
export const {
  createOrder,
  getUserOrders,
  getUserOrderById,
  cancelUserOrder,
  lookupGuestOrder,
  cancelGuestOrder,
} = defaultOrderService;
