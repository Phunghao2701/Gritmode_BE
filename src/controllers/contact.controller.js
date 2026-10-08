import { ok } from "../utils/api-response.js";
import { sendContactEmail } from "../services/email.service.js";
import logger from "../utils/logger.js";

export const submitContactMessage = async (req, res, next) => {
  try {
    await sendContactEmail(req.validatedBody || req.body);
    return ok(res, { received: true }, {
      code: "CONTACT_MESSAGE_SENT",
      message: "Tin nhắn của bạn đã được gửi đến Gritmode",
    });
  } catch (error) {
    logger.error("[contact] submitContactMessage error:", error);
    next(error);
  }
};
