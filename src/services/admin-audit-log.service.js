import { notFound } from "../errors/app-error.js";
import { auditRepository } from "../repositories/audit.repository.js";

const parseJsonIfNeeded = (data) => {
  if (data === null || data === undefined) return null;
  if (typeof data === "object") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

export const formatAuditLog = (raw) => {
  if (!raw) return null;
  const auditId = Number(raw.audit_log_id || raw.admin_audit_log_id);

  return {
    admin_audit_log_id: auditId,
    audit_log_id: auditId,
    admin: raw.user_id
      ? {
          user_id: raw.user_id,
          email: raw.admin_email || null,
          full_name: raw.admin_full_name || null,
        }
      : null,
    action_admin_audit_log: raw.action || raw.action_admin_audit_log,
    action: raw.action || raw.action_admin_audit_log,
    entity_admin_audit_log: raw.entity_name || raw.entity || raw.entity_admin_audit_log,
    entity: raw.entity_name || raw.entity || raw.entity_admin_audit_log,
    entity_id_admin_audit_log: raw.entity_id !== undefined && raw.entity_id !== null ? String(raw.entity_id) : null,
    entity_id: raw.entity_id !== undefined && raw.entity_id !== null ? String(raw.entity_id) : null,
    old_data: parseJsonIfNeeded(raw.old_data),
    new_data: parseJsonIfNeeded(raw.new_data),
    created_at: raw.created_at,
  };
};

export const createAdminAuditLogService = ({
  audits = auditRepository,
} = {}) => ({
  /**
   * Get paginated audit logs with search and filters
   */
  async getAuditLogs(query = {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [total, items] = await Promise.all([
      audits.countAuditLogs(query),
      audits.findAuditLogs(query),
    ]);

    const formattedItems = (items || []).map(formatAuditLog);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: formattedItems,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
      },
    };
  },

  /**
   * Get single audit log detail by ID
   */
  async getAuditLogById(auditLogId) {
    const log = await audits.findById(auditLogId);
    if (!log) {
      throw notFound("AUDIT_LOG_NOT_FOUND", "Không tìm thấy nhật ký quản trị");
    }
    return formatAuditLog(log);
  },

  /**
   * Internal create audit log method
   */
  async createAuditLog(
    {
      adminUserId,
      userId,
      action,
      entity,
      entityName,
      entityId,
      oldData = null,
      newData = null,
    },
    client,
  ) {
    const logEntry = await audits.log(
      {
        userId: userId || adminUserId,
        action,
        entityName: entityName || entity,
        entityId,
        oldData,
        newData,
      },
      client,
    );
    return formatAuditLog(logEntry);
  },
});

const defaultAdminAuditLogService = createAdminAuditLogService();
export const adminAuditLogService = defaultAdminAuditLogService;
export const {
  getAuditLogs,
  getAuditLogById,
  createAuditLog,
} = defaultAdminAuditLogService;
