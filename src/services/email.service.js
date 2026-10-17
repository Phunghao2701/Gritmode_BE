import dns from "node:dns";
import { createHash } from "node:crypto";
import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import nodemailer from "nodemailer";
import { AppError } from "../errors/app-error.js";
import logger from "../utils/logger.js";
import { orderConfirmationText, renderOrderConfirmationEmail } from "../templates/order-confirmation.template.js";
import { createOrderDetailToken } from "../utils/order-detail-link.js";

// Đảm bảo DNS ưu tiên IPv4 khi chạy trên cloud container
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const hashForIdempotency = (value) => createHash("sha256").update(String(value)).digest("hex");

const resolvePublicWebUrl = (env = process.env) => String(env.PUBLIC_WEB_URL || env.FRONTEND_URL || "")
  .split(",")
  .map((value) => value.trim())
  .find(Boolean)
  ?.replace(/\/+$/, "") || "";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
}[char]));

const CONTACT_TOPIC_LABELS = {
  order_support: "Hỗ trợ đơn hàng",
  size_advice: "Tư vấn chọn size",
  product_feedback: "Góp ý sản phẩm",
  product_question: "Tư vấn sản phẩm",
  partnership: "Hợp tác",
  other: "Khác",
};

const otpTemplate = (otp) => `
<!doctype html>
<html lang="vi">
  <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:24px">
    <div style="max-width:520px;margin:auto;background:#fff;padding:32px;border-radius:12px">
      <h2>Mã xác thực Gritmode</h2>
      <p>Mã OTP của bạn là:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:20px;background:#f3f4f6;border-radius:8px">
        ${otp}
      </div>
      <p>Mã có hiệu lực trong 5 phút.</p>
      <p>Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>
    </div>
  </body>
</html>`;

export const createEmailService = ({
  env = process.env,
  transportFactory = nodemailer.createTransport,
} = {}) => {
  let cachedTransport = null;

  // --- Gửi qua Resend API (HTTPS Port 443 - Miễn nhiễm chặn port trên Render) ---
  const sendViaResend = async ({ to, subject, html, text, idempotencyKey }) => {
    const fromAddress = env.RESEND_FROM || env.EMAIL_USER;
    if (!fromAddress?.trim()) {
      throw new AppError(500, "EMAIL_CONFIG_MISSING", "Thiếu RESEND_FROM hoặc EMAIL_USER");
    }
    const res = await axios.post(
      "https://api.resend.com/emails",
      {
        from: fromAddress,
        to: [to],
        subject,
        html,
        text,
      },
      {
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        timeout: 10000,
      }
    );
    return { success: true, message_id: res.data?.id };
  };

  // --- Gửi qua Brevo API (HTTPS Port 443) ---
  const sendViaBrevo = async ({ to, subject, html, text }) => {
    const res = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { name: "Gritmode", email: env.EMAIL_USER || "gritmode.vn@gmail.com" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      },
      {
        headers: {
          "api-key": env.BREVO_API_KEY.trim(),
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    return { success: true, message_id: res.data?.messageId };
  };

  // --- Gửi qua Gmail REST API (HTTPS Port 443 - Dùng OAuth2 token không qua SMTP) ---
  const sendViaGmailApi = async ({ to, subject, html, text }) => {
    const oauth2Client = new OAuth2Client(env.CLIENT_ID.trim(), env.CLIENT_SECRET.trim());
    oauth2Client.setCredentials({ refresh_token: env.REFRESH_TOKEN.trim() });
    const { token } = await oauth2Client.getAccessToken();

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
    const messageParts = [
      `From: "Gritmode" <${env.EMAIL_USER.trim()}>`,
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(html).toString("base64"),
    ];
    const raw = Buffer.from(messageParts.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await axios.post(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      { raw },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    return { success: true, message_id: res.data?.id };
  };

  // --- Gửi qua Nodemailer SMTP ---
  const getTransport = () => {
    if (cachedTransport) return cachedTransport;

    if (!env.EMAIL_USER?.trim()) {
      throw new AppError(500, "EMAIL_CONFIG_MISSING", "Thiếu cấu hình email: EMAIL_USER");
    }

    const hasAppPassword = Boolean((env.EMAIL_PASS || env.EMAIL_APP_PASSWORD)?.trim());
    const hasOAuth = Boolean(env.CLIENT_ID?.trim() && env.CLIENT_SECRET?.trim() && env.REFRESH_TOKEN?.trim());

    if (!hasAppPassword && !hasOAuth) {
      throw new AppError(
        500,
        "EMAIL_CONFIG_MISSING",
        "Thiếu cấu hình gửi email: Cần cung cấp RESEND_API_KEY, EMAIL_PASS hoặc bộ 3 (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)",
      );
    }

    const smtpHost = String(env.SMTP_HOST || "smtp.gmail.com").trim();
    const smtpPort = Number(env.SMTP_PORT) || 465;
    const smtpSecure = env.SMTP_SECURE === undefined
      ? smtpPort === 465
      : String(env.SMTP_SECURE).trim().toLowerCase() !== "false";

    const transportConfig = {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      family: 4,
      requireTLS: smtpPort === 587 && !smtpSecure,
      auth: hasAppPassword
        ? {
          user: env.EMAIL_USER.trim(),
          pass: (env.EMAIL_PASS || env.EMAIL_APP_PASSWORD).trim(),
        }
        : {
          type: "OAuth2",
          user: env.EMAIL_USER.trim(),
          clientId: env.CLIENT_ID.trim(),
          clientSecret: env.CLIENT_SECRET.trim(),
          refreshToken: env.REFRESH_TOKEN.trim(),
        },
      tls: {
        servername: env.SMTP_TLS_SERVERNAME || smtpHost,
        rejectUnauthorized: String(env.SMTP_TLS_REJECT_UNAUTHORIZED ?? "true").trim().toLowerCase() !== "false",
        ...(env.SMTP_TLS_CA ? { ca: env.SMTP_TLS_CA } : {}),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    };

    cachedTransport = transportFactory(transportConfig);
    return cachedTransport;
  };

  // Chọn đúng một provider từ cấu hình; lỗi provider phải nổi lên để outbox retry.
  const dispatchSend = async ({ to, subject, html, text, idempotencyKey }) => {
    const provider = String(env.EMAIL_PROVIDER || "").trim().toLowerCase();
    if (!provider) {
      throw new AppError(500, "EMAIL_CONFIG_MISSING", "Thiếu cấu hình EMAIL_PROVIDER");
    }

    switch (provider) {
      case "resend":
        if (!env.RESEND_API_KEY?.trim()) {
          throw new AppError(500, "EMAIL_CONFIG_MISSING", "Thiếu cấu hình RESEND_API_KEY");
        }
        return sendViaResend({ to, subject, html, text, idempotencyKey });
      case "brevo":
        if (!env.BREVO_API_KEY?.trim()) {
          throw new AppError(500, "EMAIL_CONFIG_MISSING", "Thiếu cấu hình BREVO_API_KEY");
        }
        return sendViaBrevo({ to, subject, html, text, idempotencyKey });
      case "gmail":
        if (!env.CLIENT_ID?.trim() || !env.CLIENT_SECRET?.trim() || !env.REFRESH_TOKEN?.trim()) {
          throw new AppError(500, "EMAIL_CONFIG_MISSING", "Thiếu cấu hình Gmail OAuth2");
        }
        return sendViaGmailApi({ to, subject, html, text, idempotencyKey });
      case "smtp": {
        const transport = getTransport();
        const result = await transport.sendMail({
          from: `"Gritmode" <${env.EMAIL_USER}>`,
          to,
          subject,
          text,
          html,
          headers: idempotencyKey ? { "X-Notification-Idempotency-Key": idempotencyKey } : undefined,
        });
        return { success: true, message_id: result.messageId };
      }
      default:
        throw new AppError(500, "EMAIL_PROVIDER_UNSUPPORTED", `Email provider không được hỗ trợ: ${provider}`);
    }
  };

  return {
    async verifyConnection() {
      const provider = String(env.EMAIL_PROVIDER || "").trim().toLowerCase();
      if (["resend", "brevo", "gmail"].includes(provider)) {
        return true;
      }
      if (provider !== "smtp") {
        throw new AppError(500, "EMAIL_PROVIDER_UNSUPPORTED", `Email provider không được hỗ trợ: ${provider || "missing"}`);
      }
      try {
        await getTransport().verify();
        return true;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(502, "EMAIL_CONNECTION_FAILED", "Không thể xác thực kết nối Email");
      }
    },

    async sendOtpEmail({ email, otp }, { idempotencyKey = `otp:${email}:${hashForIdempotency(otp)}` } = {}) {
      try {
        const result = await dispatchSend({
          to: email,
          subject: `${otp} là mã xác thực Gritmode`,
          text: `Mã OTP Gritmode của bạn là ${otp}. Mã có hiệu lực trong 5 phút.`,
          html: otpTemplate(otp),
          idempotencyKey,
        });
        logger.info(`[email] OTP sent to ${email}`);
        return result;
      } catch (error) {
        logger.error(`[email] Failed to send OTP to ${email}`, error);
        if (error instanceof AppError) throw error;
        throw new AppError(502, "EMAIL_DELIVERY_FAILED", "Không thể gửi email OTP");
      }
    },

    async sendOrderConfirmationEmail(order, { idempotencyKey = `order-email:${order.order_code}` } = {}) {
      try {
        const result = await dispatchSend({
          to: order.email_order,
          subject: `GRITMODE | Xác nhận đơn hàng #${order.order_code}`,
          text: orderConfirmationText(order),
          html: renderOrderConfirmationEmail(order, {
            frontendUrl: resolvePublicWebUrl(env),
            supportEmail: env.SUPPORT_EMAIL || env.EMAIL_USER,
            hotline: env.SUPPORT_HOTLINE,
            timeZone: env.APP_TIMEZONE || "Asia/Ho_Chi_Minh",
            orderDetailToken: createOrderDetailToken(order, { env }),
          }),
          idempotencyKey,
        });
        logger.info(`[email] Order confirmation sent for ${order.order_code}`);
        return result;
      } catch (error) {
        logger.error(`[email] Failed to send order confirmation for ${order.order_code}`, error);
        if (error instanceof AppError) throw error;
        throw new AppError(502, "EMAIL_DELIVERY_FAILED", "Không thể gửi email xác nhận đơn hàng");
      }
    },

    async sendContactEmail({ fullName, email, phone, topic, message }, { idempotencyKey } = {}) {
      const supportEmail = String(env.SUPPORT_EMAIL || env.EMAIL_USER || "").trim();
      if (!supportEmail) {
        throw new AppError(500, "EMAIL_CONFIG_MISSING", "Thiếu SUPPORT_EMAIL hoặc EMAIL_USER");
      }

      const topicLabel = CONTACT_TOPIC_LABELS[topic] || CONTACT_TOPIC_LABELS.other;
      const safeName = escapeHtml(fullName);
      const safeEmail = escapeHtml(email);
      const safePhone = escapeHtml(phone || "Không cung cấp");
      const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
      const emailHref = `mailto:${safeEmail}`;
      const text = [
        `Họ tên: ${fullName}`,
        `Email: ${email}`,
        `Số điện thoại: ${phone || "Không cung cấp"}`,
        `Chủ đề: ${topicLabel}`,
        "",
        "Nội dung:",
        message,
      ].join("\n");
      const html = `
        <!doctype html>
        <html lang="vi">
          <body style="margin:0;background:#f4f4f2;color:#111;font-family:Arial,Helvetica,sans-serif">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f2;padding:32px 16px">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#fff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
                    <tr>
                      <td style="padding:28px 32px;background:#0a0a0a;color:#fff">
                        <div style="font-size:22px;font-weight:800;letter-spacing:2px">GRITMODE<sup style="font-size:9px">®</sup></div>
                        <div style="margin-top:8px;color:#b8b8b8;font-size:11px;font-weight:700;letter-spacing:2px">CONTACT CENTER</div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:32px">
                        <div style="color:#999;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Tin nhắn mới từ website</div>
                        <h1 style="margin:10px 0 8px;font-size:26px;line-height:1.2;font-weight:800">${escapeHtml(topicLabel)}</h1>
                        <p style="margin:0;color:#777;font-size:14px;line-height:1.6">Khách hàng đã gửi một yêu cầu hỗ trợ tới Gritmode.</p>

                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-top:1px solid #ededed">
                          <tr>
                            <td style="padding:14px 0;border-bottom:1px solid #ededed;color:#999;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;width:34%">Họ tên</td>
                            <td style="padding:14px 0;border-bottom:1px solid #ededed;font-size:14px;font-weight:700">${safeName}</td>
                          </tr>
                          <tr>
                            <td style="padding:14px 0;border-bottom:1px solid #ededed;color:#999;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Email</td>
                            <td style="padding:14px 0;border-bottom:1px solid #ededed;font-size:14px"><a href="${emailHref}" style="color:#111;text-decoration:underline">${safeEmail}</a></td>
                          </tr>
                          <tr>
                            <td style="padding:14px 0;border-bottom:1px solid #ededed;color:#999;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Số điện thoại</td>
                            <td style="padding:14px 0;border-bottom:1px solid #ededed;font-size:14px">${safePhone}</td>
                          </tr>
                        </table>

                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background:#f7f7f5;border-radius:12px">
                          <tr>
                            <td style="padding:20px">
                              <div style="color:#999;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Nội dung</div>
                              <div style="margin-top:10px;font-size:15px;line-height:1.7;white-space:normal">${safeMessage}</div>
                            </td>
                          </tr>
                        </table>

                        <p style="margin:28px 0 0"><a href="${emailHref}" style="display:inline-block;padding:13px 20px;background:#0a0a0a;border-radius:999px;color:#fff;font-size:12px;font-weight:700;letter-spacing:1px;text-decoration:none;text-transform:uppercase">Phản hồi khách hàng</a></p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:18px 32px;border-top:1px solid #ededed;color:#999;font-size:11px;line-height:1.6">Email này được gửi từ form liên hệ trên gritmode.vn.</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>`;

      try {
        const result = await dispatchSend({
          to: supportEmail,
          subject: `[Gritmode Contact] ${topicLabel}`,
          text,
          html,
          idempotencyKey: idempotencyKey || `contact:${hashForIdempotency(`${email}|${fullName}|${message}`)}`,
        });
        logger.info(`[email] Contact message sent from ${email}`);
        return result;
      } catch (error) {
        logger.error(`[email] Failed to send contact message from ${email}`, error);
        if (error instanceof AppError) throw error;
        throw new AppError(502, "EMAIL_DELIVERY_FAILED", "Không thể gửi tin nhắn liên hệ");
      }
    },
  };
};

export const emailService = createEmailService();
export const { sendOtpEmail, sendOrderConfirmationEmail, sendContactEmail } = emailService;

