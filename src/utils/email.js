import { google } from 'googleapis';
import logger from './logger.js';

const REQUIRED_GMAIL_ENV = [
  'EMAIL_USER',
  'CLIENT_ID',
  'CLIENT_SECRET',
  'REFRESH_TOKEN'
];

/**
 * Tạo Gmail client tại thời điểm gửi để chắc chắn biến môi trường đã được nạp.
 * Đồng thời báo lỗi cấu hình rõ ràng thay vì gọi OAuth với giá trị rỗng.
 */
const getGmailClient = () => {
  const missingEnv = REQUIRED_GMAIL_ENV.filter((name) => !process.env[name]);

  if (missingEnv.length > 0) {
    const error = new Error(
      `Thiếu cấu hình gửi email: ${missingEnv.join(', ')}`
    );
    error.code = 'EMAIL_CONFIG_MISSING';
    throw error;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN
  });

  return google.gmail({
    version: 'v1',
    auth: oauth2Client
  });
};

// ======================================================
// CREATE RAW EMAIL
// ======================================================

const createRawEmail = ({
  to,
  from,
  subject,
  html
}) => {
  const email = [
    `From: ${from}`,
    `To: ${to}`,
    'Content-Type: text/html; charset=UTF-8',
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    '',
    html
  ].join('\n');

  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

// ======================================================
// EMAIL TEMPLATE
// ======================================================

const activationTemplate = ({
  firstName,
  activationUrl
}) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Account Activation</title>
      </head>

      <body
        style="
          font-family: Arial, sans-serif;
          background: #f5f5f5;
          padding: 20px;
        "
      >
        <div
          style="
            max-width: 600px;
            margin: auto;
            background: white;
            border-radius: 10px;
            overflow: hidden;
          "
        >
          <div
            style="
              background: #2563eb;
              color: white;
              padding: 30px;
              text-align: center;
            "
          >
            <h1>Scientific Journal System</h1>
          </div>

          <div style="padding: 30px">
            <p>
              Hello <strong>${firstName}</strong>,
            </p>

            <p>
              Thank you for registering an account with our system.
            </p>

            <p>
              Please click the button below to activate your account:
            </p>

            <div
              style="
                margin: 30px 0;
                text-align: center;
              "
            >
              <a
                href="${activationUrl}"
                style="
                  background: #2563eb;
                  color: white;
                  text-decoration: none;
                  padding: 14px 28px;
                  border-radius: 8px;
                  display: inline-block;
                  font-weight: bold;
                "
              >
                Activate Account
              </a>
            </div>

            <p>
              This activation link will expire in 24 hours.
            </p>
          </div>

          <div
            style="
              background: #f9fafb;
              padding: 20px;
              text-align: center;
              color: #6b7280;
              font-size: 13px;
            "
          >
            This is an automated email. Please do not reply to this message.
          </div>
        </div>
      </body>
    </html>
    `;

};

// ======================================================
// EMAIL HELPER
// ======================================================

export const emailHelper = {
  sendActivationEmail: async (
    toEmail,
    firstName,
    token
  ) => {
    try {
      const gmail = getGmailClient();
      const baseUrl =
        process.env.BASE_URL_ACTIVATION ||
        'http://localhost:5173/verify-email';

      const activationUrl =
        `${baseUrl}?token=${token}`;

      const html = activationTemplate({
        firstName,
        activationUrl
      });

      const raw = createRawEmail({
        to: toEmail,

        from:
          `Scientific Journal System <${process.env.EMAIL_USER}>`,

        subject:
          'Activate Your Scientific Journal System Account',

        html
      });

      const response =
        await gmail.users.messages.send({
          userId: 'me',

          requestBody: {
            raw
          }
        });

      logger.info(
        `[MAIL]: Đã gửi email tới ${toEmail}`
      );

      console.log(response.data);

      return response.data;

    } catch (error) {
      logger.error(
        `[MAIL]: Lỗi gửi activation email tới ${toEmail}`,
        error
      );

      const deliveryError = new Error(
        'Không thể gửi email kích hoạt tài khoản'
      );
      deliveryError.code = 'EMAIL_DELIVERY_FAILED';
      deliveryError.statusCode = 502;
      deliveryError.cause = error;
      throw deliveryError;
    }
  },

  /**
   * Gửi email đặt lại mật khẩu
   * @param {string} toEmail Email người nhận
   * @param {string} firstName Tên người nhận
   * @param {string} token Token đặt lại mật khẩu (dạng plain text)
   */
  sendResetPasswordEmail: async (
    toEmail,
    firstName,
    token
  ) => {
    try {
      const gmail = getGmailClient();
      const baseUrl =
        process.env.BASE_URL_RESET_PASSWORD ||
        process.env.FRONTEND_URL ||
        'http://localhost:5173';

      const resetUrl =
        `${baseUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

      // English HTML template
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background-color: #f3f4f6;
              color: #1f2937;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background: #ffffff;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
              border: 1px solid #e5e7eb;
            }
            .header {
              background: linear-gradient(135deg, #2563eb, #1d4ed8);
              padding: 40px 20px;
              text-align: center;
              color: #ffffff;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
              letter-spacing: 0.5px;
            }
            .content {
              padding: 30px 40px;
              line-height: 1.6;
            }
            .content p {
              margin-bottom: 24px;
              font-size: 16px;
            }
            .btn-wrapper {
              text-align: center;
              margin: 35px 0;
            }
            .btn {
              display: inline-block;
              background-color: #2563eb;
              color: #ffffff !important;
              padding: 14px 32px;
              text-decoration: none;
              font-weight: 600;
              border-radius: 8px;
              font-size: 16px;
              box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
              transition: background-color 0.2s;
            }
            .btn:hover {
              background-color: #1d4ed8;
            }
            .footer {
              background-color: #f9fafb;
              padding: 20px 40px;
              text-align: center;
              font-size: 13px;
              color: #6b7280;
              border-top: 1px solid #f3f4f6;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Reset Your Password</h1>
            </div>
            <div class="content">
              <p>Hello <strong>${firstName}</strong>,</p>
              <p>You are receiving this email because we received a password reset request for your account at the Scientific Journal System.</p>
              <p>Please click the button below to proceed with resetting your password:</p>
              <div class="btn-wrapper">
                <a href="${resetUrl}" class="btn" target="_blank">Reset Password</a>
              </div>
              <p>This link is valid for <strong>15 minutes</strong>. If you did not request a password reset, no further action is required and you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>This is an automated email from the system. Please do not reply to this message.</p>
              <p>&copy; 2026 Scientific Journal System. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const raw = createRawEmail({
        to: toEmail,
        from: `Scientific Journal System <${process.env.EMAIL_USER}>`,
        subject: 'Reset Your Scientific Journal System Account Password',
        html
      });

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw
        }
      });

      // Giữ log hệ thống tiếng Việt để bạn dễ theo dõi ở terminal, chỉ thay đổi nội dung email gửi đi
      logger.info(
        `[MAIL]: Đã gửi email đặt lại mật khẩu tới ${toEmail}`
      );

      console.log(response.data);
      return response.data;

    } catch (error) {
      logger.error(
        `[MAIL]: Lỗi gửi email đặt lại mật khẩu tới ${toEmail}`,
        error
      );

      const deliveryError = new Error(
        'Không thể gửi email đặt lại mật khẩu'
      );
      deliveryError.code = 'EMAIL_DELIVERY_FAILED';
      deliveryError.statusCode = 502;
      deliveryError.cause = error;
      throw deliveryError;
    }
  }
};
