export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const conflict = (code, message, details) => new AppError(409, code, message, details);
export const unauthorized = (code, message) => new AppError(401, code, message);
export const forbidden = (code, message) => new AppError(403, code, message);
export const notFound = (code, message) => new AppError(404, code, message);
export const tooManyRequests = (code, message) => new AppError(429, code, message);
