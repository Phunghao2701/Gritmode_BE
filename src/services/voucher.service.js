import { badRequest, conflict, notFound } from "../errors/app-error.js";
import { voucherRepository } from "../repositories/voucher.repository.js";
import { getCart as defaultGetCart } from "./cart.service.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../config/database.js";
import logger from "../utils/logger.js";

/**
 * Tính số tiền giảm giá dựa vào cấu hình voucher và subtotal
 */
export const calculateVoucherDiscount = (voucher, subtotal) => {
  const numSubtotal = Number(subtotal) || 0;
  if (numSubtotal <= 0) return 0;

  let discount = 0;
  if (voucher.discount_type === "percentage") {
    const rawDiscount = Math.round((numSubtotal * Number(voucher.discount_value)) / 100);
    if (voucher.maximum_discount_amount !== null && voucher.maximum_discount_amount !== undefined) {
      discount = Math.min(rawDiscount, Number(voucher.maximum_discount_amount));
    } else {
      discount = rawDiscount;
    }
  } else if (voucher.discount_type === "fixed_amount") {
    discount = Math.min(Number(voucher.discount_value), numSubtotal);
  }

  return Math.max(0, Math.min(discount, numSubtotal));
};

/**
 * Tính trạng thái runtime của voucher: active, inactive, scheduled, expired, exhausted
 */
export const getVoucherRuntimeStatus = (voucher, now = new Date()) => {
  if (voucher.is_active === false) return "inactive";
  if (voucher.start_at && new Date(voucher.start_at) > now) return "scheduled";
  if (voucher.end_at && new Date(voucher.end_at) < now) return "expired";
  if (
    voucher.usage_limit !== null &&
    voucher.usage_limit !== undefined &&
    Number(voucher.usage_count) >= Number(voucher.usage_limit)
  ) {
    return "exhausted";
  }
  return "active";
};

export const decorateVoucher = (voucher, now = new Date()) => {
  if (!voucher) return null;
  const usageLimit = voucher.usage_limit !== null && voucher.usage_limit !== undefined ? Number(voucher.usage_limit) : null;
  const usageCount = Number(voucher.usage_count) || 0;

  return {
    ...voucher,
    voucher_id: Number(voucher.voucher_id),
    discount_value: Number(voucher.discount_value),
    minimum_order_amount: Number(voucher.minimum_order_amount || 0),
    maximum_discount_amount:
      voucher.maximum_discount_amount !== null && voucher.maximum_discount_amount !== undefined
        ? Number(voucher.maximum_discount_amount)
        : null,
    usage_limit: usageLimit,
    usage_count: usageCount,
    remaining_usage: usageLimit !== null ? Math.max(0, usageLimit - usageCount) : null,
    is_active: Boolean(voucher.is_active),
    status_voucher: getVoucherRuntimeStatus(voucher, now),
  };
};

export const createVoucherService = ({
  vouchers = voucherRepository,
  carts = { getCart: defaultGetCart },
  audits = auditRepository,
  transaction = withTransaction,
} = {}) => {
  return {
    /**
     * Preview / validate voucher for active cart
     */
    async validateVoucher(owner, codeVoucher) {
      const cart = await carts.getCart(owner);
      if (!cart || !cart.items || cart.items.length === 0 || Number(cart.summary?.subtotal || 0) <= 0) {
        throw badRequest("CART_EMPTY", "Giỏ hàng trống hoặc chưa có sản phẩm");
      }

      const subtotal = Number(cart.summary.subtotal);
      const normalizedCode = codeVoucher.trim().toUpperCase();

      const voucher = await vouchers.findByCode(normalizedCode);
      if (!voucher) {
        throw notFound("VOUCHER_NOT_FOUND", "Mã giảm giá không tồn tại");
      }

      const now = new Date();
      if (!voucher.is_active) {
        throw badRequest("VOUCHER_INACTIVE", "Mã giảm giá hiện không hoạt động");
      }
      if (voucher.start_at && new Date(voucher.start_at) > now) {
        throw badRequest("VOUCHER_NOT_STARTED", "Mã giảm giá chưa đến thời gian áp dụng");
      }
      if (voucher.end_at && new Date(voucher.end_at) < now) {
        throw badRequest("VOUCHER_EXPIRED", "Mã giảm giá đã hết hạn");
      }
      if (
        voucher.usage_limit !== null &&
        voucher.usage_limit !== undefined &&
        Number(voucher.usage_count) >= Number(voucher.usage_limit)
      ) {
        throw conflict("VOUCHER_EXHAUSTED", "Mã giảm giá đã hết lượt sử dụng");
      }

      const minOrder = Number(voucher.minimum_order_amount || 0);
      if (subtotal < minOrder) {
        const err = badRequest(
          "MINIMUM_ORDER_NOT_MET",
          "Giá trị đơn hàng chưa đạt mức tối thiểu để áp dụng mã giảm giá",
        );
        err.data = {
          minimum_order_amount: minOrder,
          current_subtotal: subtotal,
        };
        throw err;
      }

      const discountAmount = calculateVoucherDiscount(voucher, subtotal);
      const totalAfterDiscount = Math.max(0, subtotal - discountAmount);

      return {
        voucher_id: Number(voucher.voucher_id),
        code_voucher: voucher.code_voucher,
        name_voucher: voucher.name_voucher,
        discount_type: voucher.discount_type,
        discount_value: Number(voucher.discount_value),
        subtotal,
        discount_amount: discountAmount,
        total_after_discount: totalAfterDiscount,
      };
    },

    /**
     * Admin list vouchers
     */
    async getVouchers(query = {}) {
      const { page = 1, limit = 20, search, discount_type, is_active, status, sort = "created_desc" } = query;
      const filter = { page, limit, search, discount_type, is_active, status, sort };

      const [items, total] = await Promise.all([
        vouchers.findAll(filter),
        vouchers.countAll(filter),
      ]);

      const now = new Date();
      return {
        items: items.map((v) => decorateVoucher(v, now)),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          total_pages: Math.ceil(total / limit),
        },
      };
    },

    /**
     * Admin get voucher detail
     */
    async getVoucherById(voucherId) {
      const voucher = await vouchers.findById(voucherId);
      if (!voucher) {
        throw notFound("VOUCHER_NOT_FOUND", "Không tìm thấy mã giảm giá");
      }
      return decorateVoucher(voucher);
    },

    /**
     * Admin create voucher
     */
    async createVoucher(data, userId) {
      const normalizedCode = data.code_voucher.trim().toUpperCase();
      const existing = await vouchers.findByCode(normalizedCode);
      if (existing) {
        throw conflict("VOUCHER_CODE_EXISTS", "Mã giảm giá đã tồn tại");
      }

      return transaction(async (client) => {
        const created = await vouchers.create(data, client);

        if (audits?.record) {
          await audits.record(
            {
              userId,
              action: "create_voucher",
              entityName: "voucher",
              entityId: String(created.voucher_id),
              newData: created,
            },
            client,
          );
        }

        return decorateVoucher(created);
      });
    },

    /**
     * Admin update voucher
     */
    async updateVoucher(voucherId, data, userId) {
      const existing = await vouchers.findById(voucherId);
      if (!existing) {
        throw notFound("VOUCHER_NOT_FOUND", "Không tìm thấy mã giảm giá");
      }

      if (data.code_voucher) {
        const normalizedCode = data.code_voucher.trim().toUpperCase();
        if (normalizedCode !== existing.code_voucher) {
          const duplicate = await vouchers.findByCode(normalizedCode);
          if (duplicate && Number(duplicate.voucher_id) !== Number(voucherId)) {
            throw conflict("VOUCHER_CODE_EXISTS", "Mã giảm giá đã tồn tại");
          }
        }
      }

      const mergedStartAt = data.start_at !== undefined ? data.start_at : existing.start_at;
      const mergedEndAt = data.end_at !== undefined ? data.end_at : existing.end_at;
      if (mergedStartAt && mergedEndAt && new Date(mergedStartAt) > new Date(mergedEndAt)) {
        throw badRequest("INVALID_DATE_RANGE", "start_at phải nhỏ hơn hoặc bằng end_at");
      }

      if (
        data.usage_limit !== undefined &&
        data.usage_limit !== null &&
        Number(data.usage_limit) < Number(existing.usage_count)
      ) {
        throw badRequest(
          "INVALID_USAGE_LIMIT",
          `Giới hạn sử dụng (${data.usage_limit}) không thể nhỏ hơn số lượt đã sử dụng (${existing.usage_count})`,
        );
      }

      return transaction(async (client) => {
        const updated = await vouchers.update(voucherId, data, client);

        if (audits?.record) {
          await audits.record(
            {
              userId,
              action: "update_voucher",
              entityName: "voucher",
              entityId: String(voucherId),
              oldData: existing,
              newData: updated,
            },
            client,
          );
        }

        return decorateVoucher(updated);
      });
    },

    /**
     * Admin update voucher status
     */
    async updateVoucherStatus(voucherId, isActive, userId) {
      const existing = await vouchers.findById(voucherId);
      if (!existing) {
        throw notFound("VOUCHER_NOT_FOUND", "Không tìm thấy mã giảm giá");
      }

      return transaction(async (client) => {
        const updated = await vouchers.updateStatus(voucherId, isActive, client);

        if (audits?.record) {
          await audits.record(
            {
              userId,
              action: "update_voucher_status",
              entityName: "voucher",
              entityId: String(voucherId),
              oldData: existing,
              newData: updated,
            },
            client,
          );
        }

        return decorateVoucher(updated);
      });
    },

    /**
     * Admin delete voucher
     */
    async deleteVoucher(voucherId, userId) {
      const existing = await vouchers.findById(voucherId);
      if (!existing) {
        throw notFound("VOUCHER_NOT_FOUND", "Không tìm thấy mã giảm giá");
      }

      const hasOrders = await vouchers.hasOrderReferences(voucherId);
      if (hasOrders) {
        throw conflict("VOUCHER_IN_USE", "Không thể xóa voucher đã có lịch sử đơn hàng");
      }

      return transaction(async (client) => {
        await vouchers.delete(voucherId, client);

        if (audits?.record) {
          await audits.record(
            {
              userId,
              action: "delete_voucher",
              entityName: "voucher",
              entityId: String(voucherId),
              oldData: existing,
            },
            client,
          );
        }
      });
    },

    /**
     * Internal atomic increment for checkout transaction
     */
    async incrementVoucherUsage(voucherId, client) {
      const result = await vouchers.incrementUsage(voucherId, client);
      if (!result) {
        logger.error(`[voucher] incrementVoucherUsage: limit reached for voucherId=${voucherId}`);
        throw conflict("VOUCHER_EXHAUSTED", "Mã giảm giá đã hết lượt sử dụng");
      }
      return decorateVoucher(result);
    },
  };
};

const defaultVoucherService = createVoucherService();
export const voucherService = defaultVoucherService;

export const {
  validateVoucher,
  getVouchers,
  getVoucherById,
  createVoucher,
  updateVoucher,
  updateVoucherStatus,
  deleteVoucher,
  incrementVoucherUsage,
} = defaultVoucherService;

