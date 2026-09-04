import dns from "node:dns";
import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import nodemailer from "nodemailer";
import { AppError } from "../errors/app-error.js";
import logger from "../utils/logger.js";
import { orderConfirmationText, renderOrderConfirmationEmail } from "../templates/order-confirmation.template.js";

// Đảm bảo DNS ưu tiên IPv4 khi chạy trên cloud container
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

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
  const sendViaResend = async ({ to, subject, html, text }) => {
    const fromAddress = env.RESEND_FROM || "Gritmode <onboarding@resend.dev>";
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

    const transportConfig = {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      family: 4,
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
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    };

    cachedTransport = transportFactory(transportConfig);
    return cachedTransport;
  };

  // Bộ điều hướng gửi email (Dispatch multi-strategy)
  const dispatchSend = async ({ to, subject, html, text }) => {
    // 1. Nếu có RESEND_API_KEY -> ưu tiên gửi qua Resend HTTPS API (Nhanh và ổn định nhất trên Render)
    if (env.RESEND_API_KEY?.trim()) {
      try {
        return await sendViaResend({ to, subject, html, text });
      } catch (err) {
        logger.warn("[email] Resend API failed, trying next strategy:", err.message);
      }
    }

    // 2. Nếu có BREVO_API_KEY -> gửi qua Brevo HTTPS API
    if (env.BREVO_API_KEY?.trim()) {
      try {
        return await sendViaBrevo({ to, subject, html, text });
      } catch (err) {
        logger.warn("[email] Brevo API failed, trying next strategy:", err.message);
      }
    }

    // 3. Nếu có OAuth2 (CLIENT_ID + REFRESH_TOKEN) -> thử Gmail REST API (Port 443)
    if (env.CLIENT_ID?.trim() && env.CLIENT_SECRET?.trim() && env.REFRESH_TOKEN?.trim()) {
      try {
        return await sendViaGmailApi({ to, subject, html, text });
      } catch (err) {
        logger.warn("[email] Gmail REST API failed, fallbacking to SMTP:", err.message);
      }
    }

    // 4. Fallback sang Nodemailer SMTP
    const transport = getTransport();
    const result = await transport.sendMail({
      from: `"Gritmode" <${env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
    return { success: true, message_id: result.messageId };
  };

  return {
    async verifyConnection() {
      if (env.RESEND_API_KEY?.trim() || env.BREVO_API_KEY?.trim()) return true;
      try {
        await getTransport().verify();
        return true;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(502, "EMAIL_CONNECTION_FAILED", "Không thể xác thực kết nối Email");
      }
    },

    async sendOtpEmail({ email, otp }) {
      try {
        const result = await dispatchSend({
          to: email,
          subject: `${otp} là mã xác thực Gritmode`,
          text: `Mã OTP Gritmode của bạn là ${otp}. Mã có hiệu lực trong 5 phút.`,
          html: otpTemplate(otp),
        });
        logger.info(`[email] OTP sent to ${email}`);
        return result;
      } catch (error) {
        logger.error(`[email] Failed to send OTP to ${email}`, error);
        if (error instanceof AppError) throw error;
        throw new AppError(502, "EMAIL_DELIVERY_FAILED", "Không thể gửi email OTP");
      }
    },

    async sendOrderConfirmationEmail(order) {
      try {
        const result = await dispatchSend({
          to: order.email_order,
          subject: `GRITMODE | Xác nhận đơn hàng #${order.order_code}`,
          text: orderConfirmationText(order),
          html: renderOrderConfirmationEmail(order, {
            frontendUrl: env.FRONTEND_URL,
            supportEmail: env.SUPPORT_EMAIL || env.EMAIL_USER,
            hotline: env.SUPPORT_HOTLINE,
          }),
        });
        logger.info(`[email] Order confirmation sent for ${order.order_code}`);
        return result;
      } catch (error) {
        logger.error(`[email] Failed to send order confirmation for ${order.order_code}`, error);
        if (error instanceof AppError) throw error;
        throw new AppError(502, "EMAIL_DELIVERY_FAILED", "Không thể gửi email xác nhận đơn hàng");
      }
    },
  };
};

export const emailService = createEmailService();
export const { sendOtpEmail, sendOrderConfirmationEmail } = emailService;

