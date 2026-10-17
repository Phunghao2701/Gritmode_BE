import { ok } from "../utils/api-response.js";
import { toClientRefundRequest } from "../utils/client-response.js";
import * as refundService from "../services/refund.service.js";
import logger from "../utils/logger.js";

export const createRefundController = ({ refunds = refundService } = {}) => ({
  requestMyRefund: async (req, res, next) => {
    try {
      const orderId = req.validatedParams?.orderId || req.params.orderId;
      const payload = req.validatedBody || req.body || {};
      const result = await refunds.requestRefund({
        orderId,
        userId: req.user.user_id,
        userEmail: req.user.email,
        reason: payload.reason,
      });
      return ok(res, {
        ...result,
        refund_request: toClientRefundRequest(result.refund_request),
      }, {
        code: result.already_requested ? "REFUND_REQUEST_ALREADY_EXISTS" : "REFUND_REQUEST_CREATED",
        message: result.already_requested
          ? "Yêu cầu hoàn tiền của bạn đang được xử lý"
          : "Đã gửi yêu cầu hoàn tiền",
      });
    } catch (error) {
      logger.error("[refund] requestMyRefund error:", error);
      next(error);
    }
  },

  requestGuestRefund: async (req, res, next) => {
    try {
      const payload = req.validatedBody || req.body || {};
      const result = await refunds.requestGuestRefund(req.params.orderCode, payload);
      return ok(res, {
        ...result,
        refund_request: toClientRefundRequest(result.refund_request),
      }, {
        code: result.already_requested ? "REFUND_REQUEST_ALREADY_EXISTS" : "REFUND_REQUEST_CREATED",
        message: result.already_requested
          ? "Yêu cầu hoàn tiền của bạn đang được xử lý"
          : "Đã gửi yêu cầu hoàn tiền",
      });
    } catch (error) {
      logger.error("[refund] requestGuestRefund error:", error);
      next(error);
    }
  },

  getAdminRefunds: async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query || {};
      const result = await refunds.getAdminRefundRequests(query);
      return ok(res, result, { message: "Lấy danh sách yêu cầu hoàn tiền thành công" });
    } catch (error) {
      logger.error("[admin-refund] getAdminRefunds error:", error);
      next(error);
    }
  },

  completeRefund: async (req, res, next) => {
    try {
      const refundRequestId = req.validatedParams?.refundRequestId || req.params.refundRequestId;
      const payload = req.validatedBody || req.body || {};
      const result = await refunds.completeRefund(refundRequestId, {
        adminUserId: req.user.user_id,
        providerReference: payload.provider_reference,
        adminNote: payload.admin_note,
      });
      return ok(res, result, { message: "Đã ghi nhận hoàn tiền thành công" });
    } catch (error) {
      logger.error("[admin-refund] completeRefund error:", error);
      next(error);
    }
  },
});

const defaultRefundController = createRefundController();
export const {
  requestMyRefund,
  requestGuestRefund,
  getAdminRefunds,
  completeRefund,
} = defaultRefundController;
