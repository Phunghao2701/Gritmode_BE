import { badRequest } from "../errors/app-error.js";
import { isValidGuestToken } from "../utils/cart-validation.js";

export const resolveCartOwner = ({ allowMissingGuest = false } = {}) => (req, res, next) => {
  if (req.user?.user_id) {
    req.cartOwner = { type: "user", userId: req.user.user_id };
    return next();
  }
  const guestToken = req.get("X-Guest-Token")?.trim();
  if (!guestToken) {
    if (!allowMissingGuest) return next(badRequest("GUEST_TOKEN_REQUIRED", "Thiếu X-Guest-Token"));
    req.cartOwner = { type: "guest" };
    return next();
  }
  if (!isValidGuestToken(guestToken)) return next(badRequest("GUEST_TOKEN_INVALID", "X-Guest-Token không hợp lệ"));
  req.cartOwner = { type: "guest", guestToken };
  next();
};
