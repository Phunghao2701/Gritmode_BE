import express from 'express';
import cors from 'cors';
import rootRouter from './routes/index.js';
import cookieParser from 'cookie-parser';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { mountSwagger } from './config/swagger.js';
import { resolve } from 'node:path';

import { serverTimingMiddleware } from './middlewares/server-timing.middleware.js';

const app = express();

app.use(serverTimingMiddleware);

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Cấu hình Middleware hệ thống
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(origin) ||
      origin.includes('gritmode.vn') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      return callback(null, true);
    }
    callback(null, false);
  },
  credentials: true,
  maxAge: 86400, // Cache preflight OPTIONS in browser for 24 hours
}));
app.use(cookieParser());
app.use(express.json());
app.use('/uploads', express.static(resolve(process.cwd(), 'uploads')));

mountSwagger(app);


// Định tuyến gốc: Tất cả API sẽ bắt đầu bằng /api/v1
app.use('/api/v1', rootRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
