import { ok } from "../utils/api-response.js";
import * as adminAuditLogService from "../services/admin-audit-log.service.js";
import logger from "../utils/logger.js";

export const createAdminAuditLogController = ({
  auditLogs = adminAuditLogService,
} = {}) => ({
  /**
   * GET /api/v1/admin/audit-logs
   */
  getAuditLogs: async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query || {};
      const result = await auditLogs.getAuditLogs(query);
      return ok(res, result, { message: "Lấy danh sách nhật ký quản trị thành công" });
    } catch (error) {
      logger.error("[admin-audit-log] getAuditLogs error:", error);
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/audit-logs/:auditLogId
   */
  getAuditLogById: async (req, res, next) => {
    try {
      const auditLogId = req.validatedParams ? req.validatedParams.auditLogId : req.params.auditLogId;
      const result = await auditLogs.getAuditLogById(auditLogId);
      return ok(res, result, { message: "Lấy chi tiết nhật ký quản trị thành công" });
    } catch (error) {
      logger.error("[admin-audit-log] getAuditLogById error:", error);
      next(error);
    }
  },
});

const defaultAdminAuditLogController = createAdminAuditLogController();
export const {
  getAuditLogs,
  getAuditLogById,
} = defaultAdminAuditLogController;
