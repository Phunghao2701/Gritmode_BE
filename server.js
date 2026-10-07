import "dotenv/config";
import dns from "node:dns";
import { validateRuntimeConfig, getConfig } from "./src/config/env.js";
import app from "./src/app.js";
import { startNotificationWorker } from "./src/services/notification-dispatcher.service.js";

// Fix Render / Cloud IPv6 connection timeout to Gmail SMTP
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const config = validateRuntimeConfig();
const PORT = config.port;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📚 Swagger Docs: http://localhost:${PORT}/api-docs`);
});

const worker = process.env.NOTIFICATION_WORKER_ENABLED === "false"
  ? null
  : startNotificationWorker();

const shutdown = () => {
  worker?.stop();
  server.close(() => process.exit(0));
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
