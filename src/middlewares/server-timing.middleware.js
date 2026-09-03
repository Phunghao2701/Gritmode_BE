export const serverTimingMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  const originalEnd = res.end;
  res.end = function (...args) {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    if (!res.headersSent) {
      res.setHeader('Server-Timing', `total;dur=${durationMs.toFixed(2)};desc="Total Execution"`);
      res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
    }
    return originalEnd.apply(this, args);
  };

  next();
};
