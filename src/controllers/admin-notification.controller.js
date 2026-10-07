import { ok } from "../utils/api-response.js";
import { adminNotificationService } from "../services/admin-notification.service.js";
import { realtimeBus } from "../services/realtime-bus.service.js";
import logger from "../utils/logger.js";

const writeEvent = (res, event) => {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
};

export const createAdminNotificationController = ({
  notifications = adminNotificationService,
  bus = realtimeBus,
} = {}) => ({
  list: async (req, res, next) => {
    try {
      const result = await notifications.list(req.user.user_id, req.validatedQuery || req.query);
      return ok(res, result, { message: "Lấy thông báo quản trị thành công" });
    } catch (error) {
      logger.error("[admin-notification] list error:", error);
      next(error);
    }
  },

  markRead: async (req, res, next) => {
    try {
      const notificationId = req.validatedParams?.notificationId || req.params.notificationId;
      const result = await notifications.markRead(notificationId, req.user.user_id);
      return ok(res, result, { message: "Đã đánh dấu thông báo đã đọc" });
    } catch (error) {
      logger.error("[admin-notification] markRead error:", error);
      next(error);
    }
  },

  markAllRead: async (req, res, next) => {
    try {
      const result = await notifications.markAllRead(req.user.user_id);
      return ok(res, result, { message: "Đã đánh dấu toàn bộ thông báo đã đọc" });
    } catch (error) {
      logger.error("[admin-notification] markAllRead error:", error);
      next(error);
    }
  },

  stream: async (req, res, next) => {
    try {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      const cleanup = [];
      const close = () => {
        for (const dispose of cleanup.splice(0)) dispose();
        if (!res.writableEnded) res.end();
      };

      const unsubscribe = bus.subscribe((event) => {
        if (res.writableEnded || res.destroyed) return close();
        writeEvent(res, event);
      });
      cleanup.push(unsubscribe);

      const heartbeat = setInterval(() => {
        if (res.writableEnded || res.destroyed) return close();
        res.write(": keep-alive\n\n");
      }, 25000);
      cleanup.push(() => clearInterval(heartbeat));

      req.on("close", close);
      cleanup.push(() => req.off("close", close));

      writeEvent(res, {
        id: "0",
        type: "ready",
        data: { connected_at: new Date().toISOString() },
      });
    } catch (error) {
      logger.error("[admin-notification] stream error:", error);
      next(error);
    }
  },
});

const defaultController = createAdminNotificationController();
export const { list, markRead, markAllRead, stream } = defaultController;
