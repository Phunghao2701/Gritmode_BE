import nodemailer from "nodemailer";
import { AppError } from "../errors/app-error.js";
import logger from "../utils/logger.js";
import { orderConfirmationText, renderOrderConfirmationEmail } from "../templates/order-confirmation.template.js";

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
        "Thiếu cấu hình gửi email: Cần cung cấp EMAIL_PASS (App Password) hoặc bộ 3 (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)",
      );
    }

    const transportConfig = {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
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
      connectionTimeout: 10000, // 10s
      greetingTimeout: 10000,
      socketTimeout: 15000,
    };

    cachedTransport = transportFactory(transportConfig);
    return cachedTransport;
  };

  return {
    async verifyConnection() {
      try {
        await getTransport().verify();
        return true;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(502, "EMAIL_CONNECTION_FAILED", "Không thể xác thực kết nối Gmail OAuth2");
      }
    },

    async sendOtpEmail({ email, otp }) {
      try {
        const result = await getTransport().sendMail({
          from: `"Gritmode" <${env.EMAIL_USER}>`,
          to: email,
          subject: `${otp} là mã xác thực Gritmode`,
          text: `Mã OTP Gritmode của bạn là ${otp}. Mã có hiệu lực trong 5 phút.`,
          html: otpTemplate(otp),
        });
        logger.info(`[email] OTP sent to ${email}`);
        return { success: true, message_id: result.messageId };
      } catch (error) {
        logger.error(`[email] Failed to send OTP to ${email}`, error);
        if (error instanceof AppError) throw error;
        throw new AppError(502, "EMAIL_DELIVERY_FAILED", "Không thể gửi email OTP");
      }
    },

    async sendOrderConfirmationEmail(order) {
      try {
        const result = await getTransport().sendMail({
          from: `"GRITMODE" <${env.EMAIL_USER}>`,
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
        return { success: true, message_id: result.messageId };
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
