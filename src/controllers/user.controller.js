import { validatePositiveId } from "../utils/validation.js";
import { ok } from "../utils/api-response.js";
import { getConfig } from "../config/env.js";
import * as userService from "../services/user.service.js";
import * as addressService from "../services/address.service.js";

const config = getConfig();

const cookieOptions = (cfg = config) => ({
  httpOnly: true,
  secure: cfg.nodeEnv === "production",
  sameSite: "lax",
  path: "/api/v1",
});

export const createUserController = ({
  users = userService,
  addresses = addressService,
  config: cfg = config,
} = {}) => ({
  profile: async (req, res, next) => {
    try {
      return ok(res, await users.getProfile(req.user.user_id));
    } catch (e) {
      next(e);
    }
  },

  updateProfile: async (req, res, next) => {
    try {
      return ok(res, await users.updateProfile(req.user.user_id, req.validatedBody || req.body), { code: "PROFILE_UPDATED" });
    } catch (e) {
      next(e);
    }
  },

  changePassword: async (req, res, next) => {
    try {
      await users.changePassword(
        req.user.user_id,
        req.validatedBody || req.body,
        req.user.session_id,
      );
      return ok(res, null, { code: "PASSWORD_CHANGED" });
    } catch (e) {
      next(e);
    }
  },

  listAddresses: async (req, res, next) => {
    try {
      const listMethod = addresses.listAddresses || addresses.list;
      return ok(res, await listMethod.call(addresses, req.user.user_id));
    } catch (e) {
      next(e);
    }
  },

  getAddress: async (req, res, next) => {
    try {
      const addressId = validatePositiveId(req.params.addressId);
      const getMethod = addresses.getAddressById || addresses.getById || addresses.findById || addresses.get;
      return ok(res, await getMethod.call(addresses, req.user.user_id, addressId));
    } catch (e) {
      next(e);
    }
  },

  createAddress: async (req, res, next) => {
    try {
      const createMethod = addresses.createAddress || addresses.create;
      return ok(res, await createMethod.call(addresses, req.user.user_id, req.validatedBody || req.body), { status: 201, code: "ADDRESS_CREATED" });
    } catch (e) {
      next(e);
    }
  },

  updateAddress: async (req, res, next) => {
    try {
      const addressId = validatePositiveId(req.params.addressId);
      const updateMethod = addresses.updateAddress || addresses.update;
      return ok(res, await updateMethod.call(addresses, req.user.user_id, addressId, req.validatedBody || req.body), { code: "ADDRESS_UPDATED" });
    } catch (e) {
      next(e);
    }
  },

  removeAddress: async (req, res, next) => {
    try {
      const addressId = validatePositiveId(req.params.addressId);
      const removeMethod = addresses.removeAddress || addresses.remove;
      await removeMethod.call(addresses, req.user.user_id, addressId);
      return ok(res, null, { code: "ADDRESS_DELETED" });
    } catch (e) {
      next(e);
    }
  },

  setDefaultAddress: async (req, res, next) => {
    try {
      const addressId = validatePositiveId(req.params.addressId);
      const setMethod = addresses.setDefaultAddress || addresses.setDefault;
      return ok(res, await setMethod.call(addresses, req.user.user_id, addressId), { code: "DEFAULT_ADDRESS_UPDATED" });
    } catch (e) {
      next(e);
    }
  },

  listSessions: async (req, res, next) => {
    try {
      return ok(res, await users.listSessions(req.user.user_id, req.user?.session_id));
    } catch (e) {
      next(e);
    }
  },

  revokeSession: async (req, res, next) => {
    try {
      const sessionId = validatePositiveId(req.params.sessionId);
      await users.revokeSession(req.user.user_id, sessionId);
      return ok(res, null, { code: "SESSION_REVOKED" });
    } catch (e) {
      next(e);
    }
  },

  revokeAllSessions: async (req, res, next) => {
    try {
      await users.revokeAllSessions(req.user.user_id);
      res.clearCookie("refresh_token", cookieOptions(cfg));
      return ok(res, null, { code: "SESSIONS_REVOKED" });
    } catch (e) {
      next(e);
    }
  },
});

const defaultUserController = createUserController();

export const getProfile = defaultUserController.profile;
export const profile = defaultUserController.profile;
export const updateProfile = defaultUserController.updateProfile;
export const changePassword = defaultUserController.changePassword;
export const listAddresses = defaultUserController.listAddresses;
export const getAddress = defaultUserController.getAddress;
export const getAddressById = defaultUserController.getAddress;
export const createAddress = defaultUserController.createAddress;
export const updateAddress = defaultUserController.updateAddress;
export const removeAddress = defaultUserController.removeAddress;
export const setDefaultAddress = defaultUserController.setDefaultAddress;
export const listSessions = defaultUserController.listSessions;
export const revokeSession = defaultUserController.revokeSession;
export const revokeAllSessions = defaultUserController.revokeAllSessions;
