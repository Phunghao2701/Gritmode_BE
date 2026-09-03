import nodemailer from "nodemailer";
import { AppError } from "../errors/app-error.js";
import logger from "../utils/logger.js";
import { orderConfirmationText, renderOrderConfirmationEmail } from "../templates/order-confirmation.template.js";

const REQUIRED_EMAIL_ENV = ["EMAIL_USER", "CLIENT_ID", "CLIENT_SECRET", "REFRESH_TOKEN"];

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

    const missing = REQUIRED_EMAIL_ENV.filter((name) => !env[name]?.trim());
    if (missing.length) {
      throw new AppError(500, "EMAIL_CONFIG_MISSING", `Thiếu cấu hình email: ${missing.join(", ")}`);
    }

    cachedTransport = transportFactory({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: env.EMAIL_USER,
        clientId: env.CLIENT_ID,
        clientSecret: env.CLIENT_SECRET,
        refreshToken: env.REFRESH_TOKEN,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });

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
