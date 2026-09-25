import { AppError } from "../errors/app-error.js";

export const validateBody = (validator) => (req, res, next) => {
  const result = validator(req.body);
  if (!result.ok) return next(new AppError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", result.errors));
  req.validatedBody = result.value;
  next();
};

export const validateQuery = (validator) => (req, res, next) => {
  const result = validator(req.query);
  if (!result.ok) return next(new AppError(400, "VALIDATION_ERROR", "Tham số truy vấn không hợp lệ", result.errors));
  req.validatedQuery = result.value;
  next();
};

/**
 * Validates a route parameter using a validator function.
 * Supports both validators that return { ok, value, errors } and validators that throw AppError on failure.
 * The validated (coerced) value is stored in req.validatedParams[paramName].
 */
export const validateParam = (paramName, validator) => (req, res, next) => {
  try {
    const result = validator(req.params[paramName]);
    if (result && typeof result === "object" && "ok" in result) {
      if (!result.ok) {
        const errorMsg = result.errors?.[0]?.message || "Tham số không hợp lệ";
        return next(new AppError(400, "VALIDATION_ERROR", errorMsg, result.errors));
      }
      if (!req.validatedParams) req.validatedParams = {};
      req.validatedParams[paramName] = result.value;
    } else {
      if (!req.validatedParams) req.validatedParams = {};
      req.validatedParams[paramName] = result;
    }
    next();
  } catch (err) {
    next(err);
  }
};

