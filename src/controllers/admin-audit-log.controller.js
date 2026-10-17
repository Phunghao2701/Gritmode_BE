import { ok } from "../utils/api-response.js";
import * as auditService from "../services/audit.service.js";
import logger from "../utils/logger.js";

const serializeAuditLog = (log) => {
  if (!log) return log;
  return {
    ...log,
    admin_audit_log_id: log.admin_audit_log_id ?? log.audit_log_id,
    action_admin_audit_log: log.action_admin_audit_log ?? log.action,
    entity_admin_audit_log: log.entity_admin_audit_log ?? log.entity_name,
    entity_id_admin_audit_log: log.entity_id_admin_audit_log ?? log.entity_id,
  };
};

export const createAdminAuditLogController = ({ audits = auditService } = {}) => ({
  getAuditLogs: async (req, res, next) => {
    try {
      const query = req.validatedQuery || req.query || {};
      const result = await audits.getAuditLogs(query);
      result.items = result.items.map(serializeAuditLog);
      return ok(res, result, { message: "Lấy audit log thành công" });
    } catch (error) {
      logger.error("[admin-audit-log] getAuditLogs error:", error);
      next(error);
    }
  },

  getAuditLogById: async (req, res, next) => {
    try {
      const auditLogId = req.validatedParams?.auditLogId || req.params.auditLogId;
      const result = serializeAuditLog(await audits.getAuditLogById(auditLogId));
      return ok(res, result, { message: "Lấy chi tiết audit log thành công" });
    } catch (error) {
      logger.error("[admin-audit-log] getAuditLogById error:", error);
      next(error);
    }
  },
});

const defaultController = createAdminAuditLogController();
export const { getAuditLogs, getAuditLogById } = defaultController;
