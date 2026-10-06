import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validateParam, validateQuery } from "../middlewares/validate.middleware.js";
import { validatePositiveId } from "../utils/validation.js";
import { list, markRead, markAllRead, stream } from "../controllers/admin-notification.controller.js";

const validateNotificationQuery = (query = {}) => {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  const unreadOnly = query.unread_only === undefined
    ? false
    : query.unread_only === true || query.unread_only === "true";

  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return {
      ok: false,
      errors: [{ message: "Tham số phân trang không hợp lệ" }],
    };
  }

  return { ok: true, value: { page, limit, unread_only: unreadOnly } };
};

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/stream", stream);
router.get("/", validateQuery(validateNotificationQuery), list);
router.patch("/read-all", markAllRead);
router.patch(
  "/:notificationId/read",
  validateParam("notificationId", validatePositiveId),
  markRead,
);

export default router;
