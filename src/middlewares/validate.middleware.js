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
 * Validates a route parameter using a validator function that throws AppError on failure.
 * The validated (coerced) value is stored in req.validatedParams[paramName].
 */
export const validateParam = (paramName, validator) => (req, res, next) => {
  try {
    const value = validator(req.params[paramName]);
    if (!req.validatedParams) req.validatedParams = {};
    req.validatedParams[paramName] = value;
    next();
  } catch (err) {
    next(err);
  }
};

