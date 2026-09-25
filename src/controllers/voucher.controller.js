import {
  validateVoucher as svcValidateVoucher,
  getVouchers as svcGetVouchers,
  getVoucherById as svcGetVoucherById,
  createVoucher as svcCreateVoucher,
  updateVoucher as svcUpdateVoucher,
  updateVoucherStatus as svcUpdateVoucherStatus,
  deleteVoucher as svcDeleteVoucher,
} from "../services/voucher.service.js";
import { ok } from "../utils/api-response.js";
import logger from "../utils/logger.js";

export const createVoucherController = ({
  service = {
    validateVoucher: svcValidateVoucher,
    getVouchers: svcGetVouchers,
    getVoucherById: svcGetVoucherById,
    createVoucher: svcCreateVoucher,
    updateVoucher: svcUpdateVoucher,
    updateVoucherStatus: svcUpdateVoucherStatus,
    deleteVoucher: svcDeleteVoucher,
  },
} = {}) => ({
  /**
   * POST /api/v1/vouchers/validate
   */
  async validateVoucher(req, res, next) {
    try {
      const owner = req.cartOwner || (req.user ? { type: "user", userId: req.user.user_id } : { type: "guest" });
      const { code_voucher } = req.validatedBody || req.body || {};
      const result = await service.validateVoucher(owner, code_voucher);
      return ok(res, result, { code: "VOUCHER_APPLIED", message: "Áp dụng mã giảm giá thành công" });
    } catch (err) {
      logger.error("[voucher] validateVoucher error:", err);
      return next(err);
    }
  },

  /**
   * GET /api/v1/admin/vouchers
   */
  async getVouchers(req, res, next) {
    try {
      const query = req.validatedQuery || req.query || {};
      const result = await service.getVouchers(query);
      return ok(res, result, { code: "VOUCHER_LIST", message: "Lấy danh sách mã giảm giá thành công" });
    } catch (err) {
      logger.error("[voucher] getVouchers error:", err);
      return next(err);
    }
  },

  /**
   * GET /api/v1/admin/vouchers/:voucherId
   */
  async getVoucherById(req, res, next) {
    try {
      const voucherId = Number(req.params.voucherId);
      const result = await service.getVoucherById(voucherId);
      return ok(res, result, { code: "VOUCHER_DETAIL", message: "Lấy thông tin mã giảm giá thành công" });
    } catch (err) {
      logger.error("[voucher] getVoucherById error:", err);
      return next(err);
    }
  },

  /**
   * POST /api/v1/admin/vouchers
   */
  async createVoucher(req, res, next) {
    try {
      const data = req.validatedBody || req.body || {};
      const userId = req.user?.user_id;
      const result = await service.createVoucher(data, userId);
      return ok(res, result, { status: 201, code: "VOUCHER_CREATED", message: "Tạo mã giảm giá thành công" });
    } catch (err) {
      logger.error("[voucher] createVoucher error:", err);
      return next(err);
    }
  },

  /**
   * PATCH /api/v1/admin/vouchers/:voucherId
   */
  async updateVoucher(req, res, next) {
    try {
      const voucherId = Number(req.params.voucherId);
      const data = req.validatedBody || req.body || {};
      const userId = req.user?.user_id;
      const result = await service.updateVoucher(voucherId, data, userId);
      return ok(res, result, { code: "VOUCHER_UPDATED", message: "Cập nhật mã giảm giá thành công" });
    } catch (err) {
      logger.error("[voucher] updateVoucher error:", err);
      return next(err);
    }
  },

  /**
   * PATCH /api/v1/admin/vouchers/:voucherId/status
   */
  async updateVoucherStatus(req, res, next) {
    try {
      const voucherId = Number(req.params.voucherId);
      const { is_active } = req.validatedBody || req.body || {};
      const userId = req.user?.user_id;
      const result = await service.updateVoucherStatus(voucherId, is_active, userId);
      return ok(res, result, { code: "VOUCHER_STATUS_UPDATED", message: "Cập nhật trạng thái mã giảm giá thành công" });
    } catch (err) {
      logger.error("[voucher] updateVoucherStatus error:", err);
      return next(err);
    }
  },

  /**
   * DELETE /api/v1/admin/vouchers/:voucherId
   */
  async deleteVoucher(req, res, next) {
    try {
      const voucherId = Number(req.params.voucherId);
      const userId = req.user?.user_id;
      await service.deleteVoucher(voucherId, userId);
      return ok(res, { deleted: true }, { code: "VOUCHER_DELETED", message: "Xóa mã giảm giá thành công" });
    } catch (err) {
      logger.error("[voucher] deleteVoucher error:", err);
      return next(err);
    }
  },
});

const defaultController = createVoucherController();

export const {
  validateVoucher,
  getVouchers,
  getVoucherById,
  createVoucher,
  updateVoucher,
  updateVoucherStatus,
  deleteVoucher,
} = defaultController;
