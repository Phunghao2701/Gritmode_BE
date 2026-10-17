import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateParam, validateQuery } from "../middlewares/validate.middleware.js";
import { validateAuditLogId, validateAuditLogQuery } from "../utils/validation.js";
import {
  getAuditLogs,
  getAuditLogById,
} from "../controllers/admin-audit-log.controller.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get(
  "/audit-logs",
  validateQuery(validateAuditLogQuery),
  getAuditLogs,
);

router.get(
  "/audit-logs/:auditLogId",
  validateParam("auditLogId", validateAuditLogId),
  getAuditLogById,
);

export default router;
