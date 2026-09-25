import logger from "../utils/logger.js";
import { fail } from "../utils/api-response.js";

export const notFoundHandler = (req, res) => fail(res, {
  statusCode: 404,
  code: "ROUTE_NOT_FOUND",
  message: "Không tìm thấy endpoint",
});

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (!error.isOperational) logger.error(`${req.method} ${req.originalUrl}`, error);
  return fail(res, error.isOperational ? error : {});
};
