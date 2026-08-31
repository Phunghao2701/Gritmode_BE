import express from 'express';
import cors from 'cors';
import rootRouter from './routes/index.js';
import cookieParser from 'cookie-parser';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { mountSwagger } from './config/swagger.js';

const app = express();

// Cấu hình Middleware hệ thống
app.use(cors({
  origin: process.env.FRONTEND_URL, // Ghi đích danh tên miền/port của Frontend, KHÔNG được dùng dấu '*'
  credentials: true                // Cho phép nhận và xử lý Cookie gửi lên
}));
app.use(cookieParser());
app.use(express.json());

mountSwagger(app);


// Định tuyến gốc: Tất cả API sẽ bắt đầu bằng /api/v1
app.use('/api/v1', rootRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
