import { badRequest } from "../errors/app-error.js";
import { adminNotificationRepository } from "../repositories/admin-notification.repository.js";

export const createAdminNotificationService = ({ notifications = adminNotificationRepository } = {}) => ({
  async list(adminUserId, query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const unreadOnly = query.unread_only === true || query.unread_only === "true";
    const [items, total, unreadCount] = await Promise.all([
      notifications.list({ adminUserId, page, limit, unreadOnly }),
      notifications.count({ adminUserId, unreadOnly }),
      notifications.count({ adminUserId, unreadOnly: true }),
    ]);

    return {
      items,
      unread_count: unreadCount,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async markRead(notificationId, adminUserId) {
    const numericId = Number(notificationId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw badRequest("INVALID_NOTIFICATION_ID", "Mã thông báo không hợp lệ");
    }
    return notifications.markRead(numericId, adminUserId);
  },

  async markAllRead(adminUserId) {
    return notifications.markAllRead(adminUserId);
  },
});

export const adminNotificationService = createAdminNotificationService();
