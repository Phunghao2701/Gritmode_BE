import { OAuth2Client } from "google-auth-library";
import { unauthorized } from "../errors/app-error.js";

export const createGoogleVerifier = (clientId) => {
  const client = new OAuth2Client(clientId);
  return {
    async verify(idToken) {
      if (!idToken || !clientId) throw unauthorized("GOOGLE_TOKEN_INVALID", "Google token không hợp lệ");
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload?.email_verified) throw unauthorized("GOOGLE_EMAIL_UNVERIFIED", "Google email chưa được xác minh");
      return { email: payload.email, name: payload.name, picture: payload.picture };
    },
  };
};
