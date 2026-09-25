import "dotenv/config";
import dns from "node:dns";
import app from "./src/app.js";

// Fix Render / Cloud IPv6 connection timeout to Gmail SMTP
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📚 Swagger Docs: http://localhost:${PORT}/api-docs`);
});