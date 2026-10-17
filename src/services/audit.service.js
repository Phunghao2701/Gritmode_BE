import { notFound } from "../errors/app-error.js";
import { auditRepository } from "../repositories/audit.repository.js";

export const createAuditService = ({ audits = auditRepository } = {}) => ({
  async getAuditLogs(filter = {}) {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 20;

    const [items, total] = await Promise.all([
      audits.findAuditLogs({ ...filter, page, limit }),
      audits.countAuditLogs(filter),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async getAuditLogById(auditLogId) {
    const log = await audits.findById(auditLogId);
    if (!log) {
      throw notFound("AUDIT_LOG_NOT_FOUND", "Không tìm thấy audit log");
    }
    return log;
  },
});

const defaultAuditService = createAuditService();

export const getAuditLogs = (...args) => defaultAuditService.getAuditLogs(...args);
export const getAuditLogById = (...args) => defaultAuditService.getAuditLogById(...args);
