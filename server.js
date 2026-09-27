import "dotenv/config";
import dns from "node:dns";
import { validateRuntimeConfig } from "./src/config/env.js";
import app from "./src/app.js";

// Validate mandatory environment variables at startup - Fail Fast, No Silent Fallbacks
validateRuntimeConfig();

// Fix Render / Cloud IPv6 connection timeout to Gmail SMTP
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📚 Swagger Docs: http://localhost:${PORT}/api-docs`);
});