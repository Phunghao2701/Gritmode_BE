import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateBody, validateParam } from "../middlewares/validate.middleware.js";
import { validateCompleteRefund, validatePositiveId } from "../utils/validation.js";
import { getAdminRefunds, completeRefund } from "../controllers/refund.controller.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/refunds", getAdminRefunds);

router.patch(
  "/refunds/:refundRequestId/complete",
  validateParam("refundRequestId", validatePositiveId),
  validateBody(validateCompleteRefund),
  completeRefund,
);

export default router;
