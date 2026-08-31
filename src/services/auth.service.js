import { randomInt } from "node:crypto";
import { AppError, forbidden, unauthorized, tooManyRequests } from "../errors/app-error.js";
import { createAccessToken, createRefreshToken, hashToken } from "../utils/tokens.js";
import { userRepository } from "../repositories/user.repository.js";
import { sessionRepository } from "../repositories/session.repository.js";
import { emailOtpRepository } from "../repositories/email-otp.repository.js";
import { emailService } from "./email.service.js";
import { cartRepository } from "../repositories/cart.repository.js";
import { withTransaction } from "../config/database.js";
import { getConfig } from "../config/env.js";

const config = getConfig();

const safeUser = ({ password, ...user }) => user;

const defaultOtpGenerator = () => randomInt(100000, 1000000).toString();

export const createAuthService = ({
  users = userRepository,
  sessions = sessionRepository,
  emailOtps = emailOtpRepository,
  emails = emailService,
  carts = cartRepository,
  otpGenerator = defaultOtpGenerator,
  tokenOptions = { accessSecret: config.jwtSecret, accessExpiresIn: config.jwtExpiresIn, refreshTtlMs: config.refreshTtlMs },
  transaction = withTransaction,
} = {}) => {
  const issueSession = async (user, context = {}, client) => {
    const refreshToken = createRefreshToken();
    const session = await sessions.create(
      {
        userId: user.user_id,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt: new Date(Date.now() + tokenOptions.refreshTtlMs),
      },
      client,
    );
    return {
      user: safeUser(user),
      access_token: createAccessToken(
        { user_id: user.user_id, email: user.email, role: user.role, session_id: session?.user_session_id },
        {
          secret: tokenOptions.accessSecret,
          expiresIn: tokenOptions.accessExpiresIn,
        },
      ),
      refresh_token: refreshToken,
    };
  };

  const assertActive = (user) => {
    if (user.status === "blocked") throw forbidden("ACCOUNT_BLOCKED", "Tài khoản đã bị khóa");
    if (user.status !== "active") throw forbidden("ACCOUNT_INACTIVE", "Tài khoản chưa hoạt động");
  };

  const mergeAndIssue = (user, input, context) =>
    transaction(async (client) => {
      if (input.guest_token) {
        await carts.mergeGuestCart({ guestToken: input.guest_token, userId: user.user_id }, client);
      }
      return issueSession(user, context, client);
    });

  return {
    /**
     * Request OTP: Generates 6-digit OTP, stores hash, sends email
     */
    async requestOtp(input, context = {}) {
      const email = input.email.trim().toLowerCase();

      // Rate limit check: only 1 OTP request every 60 seconds per email
      const recentOtp = await emailOtps.findRecentByEmail(email, 60);
      if (recentOtp) {
        throw tooManyRequests("OTP_RATE_LIMITED", "Vui lòng chờ 60 giây trước khi yêu cầu mã OTP mới");
      }

      const otp = otpGenerator();
      const otpHash = hashToken(otp);
      const expiredAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await emailOtps.create({ email, otpHash, expiredAt });
      await emails.sendOtpEmail({ email, otp });

      return { expired_in: 300 };
    },

    /**
     * Verify OTP: Verifies OTP, auto-creates user or logs in, merges guest cart
     */
    async verifyOtp(input, context = {}) {
      const email = input.email.trim().toLowerCase();
      const otp = String(input.otp).trim();

      const latestOtp = await emailOtps.findLatestByEmail(email);
      if (!latestOtp || new Date(latestOtp.expired_at) < new Date()) {
        throw unauthorized("INVALID_OTP", "Mã OTP không hợp lệ hoặc đã hết hạn");
      }

      if (Number(latestOtp.attempt_count) >= 5) {
        throw tooManyRequests("OTP_ATTEMPTS_EXCEEDED", "Đã vượt quá số lần thử OTP cho phép (tối đa 5 lần)");
      }

      if (latestOtp.otp_hash !== hashToken(otp)) {
        await emailOtps.incrementAttempt(latestOtp.email_otp_id);
        throw unauthorized("INVALID_OTP", "Mã OTP không hợp lệ hoặc đã hết hạn");
      }

      await emailOtps.markVerified(latestOtp.email_otp_id);

      let user = await users.findByEmail(email);
      let isNewUser = false;

      if (!user) {
        user = await users.createFromOtp({ email });
        isNewUser = true;
      } else {
        assertActive(user);
      }

      const sessionResult = await mergeAndIssue(user, input, context);
      return {
        is_new_user: isNewUser,
        ...sessionResult,
      };
    },

    /**
     * Refresh access token
     */
    async refresh(rawToken, context = {}) {
      if (!rawToken) throw unauthorized("REFRESH_TOKEN_REQUIRED", "Thiếu refresh token");
      const existing = await sessions.findActiveByHash(hashToken(rawToken));
      if (!existing) throw unauthorized("REFRESH_TOKEN_INVALID", "Refresh token không hợp lệ hoặc đã hết hạn");
      const user = await users.findById(existing.user_id);
      if (!user) throw unauthorized("REFRESH_TOKEN_INVALID", "Refresh token không hợp lệ");
      assertActive(user);
      return transaction(async (client) => {
        await sessions.revoke(existing.user_session_id, client);
        return issueSession(user, context, client);
      });
    },

    /**
     * Logout current session
     */
    async logout(rawToken) {
      if (rawToken) await sessions.revokeByHash(hashToken(rawToken));
    },

    /**
     * Get current user
     */
    async me(userId) {
      const user = await users.findById(userId);
      if (!user) throw new AppError(404, "USER_NOT_FOUND", "Không tìm thấy người dùng");
      return safeUser(user);
    },
  };
};

const defaultAuthService = createAuthService();

export const {
  requestOtp,
  verifyOtp,
  refresh,
  logout,
  me,
} = defaultAuthService;

export { safeUser };
