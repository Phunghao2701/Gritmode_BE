import { notFound } from "../errors/app-error.js";
import { sessionRepository } from "../repositories/session.repository.js";
import { hashToken } from "../utils/tokens.js";

export const formatSession = (session, currentSessionId) => {
  if (!session) return null;
  const isRevoked = Boolean(session.revoked_at !== null && session.revoked_at !== undefined);
  const isExpired = Boolean(session.expired_at && new Date(session.expired_at) <= new Date());
  const isActive = !isRevoked && !isExpired;
  const isCurrent = Boolean(
    currentSessionId !== null &&
    currentSessionId !== undefined &&
    Number(session.user_session_id) === Number(currentSessionId)
  );

  return {
    user_session_id: Number(session.user_session_id),
    user_agent: session.user_agent || null,
    ip_address: session.ip_address || null,
    expired_at: session.expired_at,
    revoked_at: session.revoked_at || null,
    created_at: session.created_at,
    is_current: isCurrent,
    is_active: isActive,
  };
};

export const createUserSessionService = ({
  sessions = sessionRepository,
} = {}) => ({
  /**
   * Helper: Check if session is expired
   */
  isSessionExpired(session) {
    if (!session || !session.expired_at) return true;
    return new Date(session.expired_at) <= new Date();
  },

  /**
   * Helper: Check if session is revoked
   */
  isSessionRevoked(session) {
    if (!session) return true;
    return Boolean(session.revoked_at !== null && session.revoked_at !== undefined);
  },

  /**
   * Helper: Check if session is active
   */
  isSessionActive(session) {
    if (!session) return false;
    return !this.isSessionRevoked(session) && !this.isSessionExpired(session);
  },

  /**
   * Helper: Check if session belongs to user
   */
  sessionBelongsToUser(session, userId) {
    return Boolean(session && session.user_id === userId);
  },

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId, currentSessionId) {
    const list = await sessions.listByUser(userId);
    return (list || []).map((s) => formatSession(s, currentSessionId));
  },

  /**
   * Get single session by ID, enforcing ownership
   */
  async getUserSessionById(userId, sessionId, currentSessionId) {
    const session = await sessions.findById(sessionId);
    if (!session || !this.sessionBelongsToUser(session, userId)) {
      throw notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên đăng nhập");
    }
    return formatSession(session, currentSessionId);
  },

  /**
   * Create a new user session
   */
  async createUserSession(
    { userId, refreshTokenHash, userAgent, ipAddress, expiresAt },
    client,
  ) {
    return sessions.create(
      {
        userId,
        refreshTokenHash,
        userAgent,
        ipAddress,
        expiresAt,
      },
      client,
    );
  },

  /**
   * Find active session by raw refresh token
   */
  async findSessionByRefreshToken(refreshToken, client) {
    if (!refreshToken) return null;
    const hash = hashToken(refreshToken);
    return sessions.findActiveByHash(hash, client);
  },

  /**
   * Revoke single session owned by user
   */
  async revokeSession(userId, sessionId) {
    const success = await sessions.revokeOwned(Number(sessionId), userId);
    if (!success) {
      throw notFound("SESSION_NOT_FOUND", "Không tìm thấy phiên đăng nhập");
    }
  },

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(userId) {
    return sessions.revokeAllByUser(userId);
  },
});

const defaultUserSessionService = createUserSessionService();
export const userSessionService = defaultUserSessionService;
export const {
  getUserSessions,
  getUserSessionById,
  createUserSession,
  findSessionByRefreshToken,
  revokeSession,
  revokeAllUserSessions,
  isSessionExpired,
  isSessionRevoked,
  isSessionActive,
} = defaultUserSessionService;
