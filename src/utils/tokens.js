import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export const createAccessToken = ({ user_id, role, session_id }, { secret, expiresIn = "15m" }) =>
  jwt.sign(
    {
      role,
      session_id: session_id !== undefined && session_id !== null ? Number(session_id) : null,
    },
    secret,
    { subject: String(user_id), expiresIn },
  );

export const verifyAccessToken = (token, { secret }) => jwt.verify(token, secret);

export const createRefreshToken = () => crypto.randomBytes(48).toString("base64url");

export const hashToken = (token) =>
  crypto.createHash("sha256").update(token, "utf8").digest("hex");
