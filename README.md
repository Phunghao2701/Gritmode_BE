# Gritmode Backend (API & Docker Infrastructure)

Backend API cho nền tảng thương mại thời trang **Gritmode**, xây dựng trên nền tảng **Node.js (Express 5)**, **PostgreSQL 16**, **Redis 7**, và lưu trữ media qua **MinIO** (tương thích chuẩn S3).

---

## 🔑 1. Bảng Thông Tin Tài Khoản & Mật Khẩu (Default Credentials)

Dưới đây là thông tin đăng nhập mặc định cho toàn bộ các dịch vụ khi chạy qua Docker Compose ở môi trường cục bộ (Local Development):

| Dịch vụ (Service) | Địa chỉ truy cập (Web UI / Port) | Tên đăng nhập (Username) | Mật khẩu (Password) | Thông số bổ sung |
| :--- | :--- | :--- | :--- | :--- |
| **MinIO Console** | [http://localhost:9001](http://localhost:9001) | `admin` | `password123` | S3 API Port: `9000`<br>Default Bucket: `gritmode-products` |
| **pgAdmin 4 (DB Web UI)** | [http://localhost:5050](http://localhost:5050) | `admin@gritmode.vn` | `password123` | Tự động kết nối `gritmode-postgres`<br>Mật khẩu DB: `postgres` |
| **PostgreSQL Database** | `localhost:5432` / `5433` | `postgres` | `postgres` | Database Name: `gritmode_db` |
| **Mailpit (Email Trap)** | [http://localhost:8025](http://localhost:8025) | *(Không yêu cầu)* | *(Không yêu cầu)* | SMTP Port: `1025` (hứng toàn bộ OTP/email reset) |
| **Redis Cache** | `localhost:6379` | *(Không mật khẩu)* | *(Không mật khẩu)* | Port nội bộ: `6379` |
| **Backend API** | [http://localhost:5000](http://localhost:5000) | - | - | Swagger Docs: [http://localhost:5000/api-docs](http://localhost:5000/api-docs) |

---

## 🚀 2. Hướng Dẫn Khởi Chạy Nhanh (Quick Start)

### Yêu cầu tiên quyết:
- Đã cài đặt **Docker Desktop** (hoặc Docker Engine + Docker Compose v2).
- Node.js LTS (v20+ hoặc v22+) nếu muốn chạy lệnh trực tiếp trên máy host.

### Bước 1: Chuẩn bị biến môi trường
Tạo file `.env` từ file mẫu dành cho Docker:
```bash
cp .env.docker.example .env
```
*(Trên Windows PowerShell: `Copy-Item .env.docker.example .env`)*

### Bước 2: Khởi động toàn bộ hệ thống bằng Docker Compose
```bash
docker compose up -d
```
Lệnh này sẽ tự động tải và khởi động 6 containers:
- `gritmode-be` (Node Express với hot-reload)
- `gritmode-postgres` (PostgreSQL 16)
- `gritmode-redis` (Redis 7)
- `gritmode-minio` (MinIO Object Storage)
- `gritmode-mailpit` (Hứng email test)
- `gritmode-pgadmin` (Giao diện pgAdmin 4 quản lý PostgreSQL chuyên sâu)

### Bước 3: Chạy Database Migration
Khởi tạo cấu trúc bảng:
```bash
npm run db:migrate
```
*(Hoặc trong container: `docker compose exec backend npm run db:migrate`)*

### Bước 4: Đồng bộ dữ liệu thật từ Supabase về Local PostgreSQL
Sao chép toàn bộ dữ liệu thật từ cloud Supabase sang PostgreSQL local của bạn:
```bash
npm run db:sync:supabase
```
Script sẽ tự động sao chép toàn bộ các bảng (`product`, `category`, `variant`, `user`, `order`...) và đồng bộ lại sequence ID.

---

## 🛠️ 3. Các Lệnh Quản Lý Docker Thường Dùng

- **Xem logs của Backend theo thời gian thực:**
  ```bash
  docker compose logs -f backend
  ```
- **Xem trạng thái sức khỏe của các container:**
  ```bash
  docker compose ps
  ```
- **Khởi động lại Backend (khi thêm package mới):**
  ```bash
  docker compose restart backend
  ```
- **Dừng toàn bộ hệ thống:**
  ```bash
  docker compose down
  ```
- **Xóa sạch containers và reset toàn bộ dữ liệu (Data Volume):**
  ```bash
  docker compose down -v
  ```

---

## ☁️ 4. Triển Khai Lên Render (Production Deployment)

### Cách 1: Sử dụng Blueprint `render.yaml` (Khuyên dùng)
Trong file `render.yaml` đã được định nghĩa sẵn toàn bộ hạ tầng gồm:
1. **Web Service**: Chạy runtime Docker từ file `Dockerfile.prod` (multi-stage tối ưu, non-root user `node`, tự động bắt cổng `$PORT`).
2. **PostgreSQL**: Managed Database trên Render.
3. **Redis**: Key Value Store trên Render.

**Thao tác trên Render Dashboard:**
1. Vào [Render Dashboard](https://dashboard.render.com).
2. Bấm nút **`+ New`** ➔ Chọn **`Blueprint`**.
3. Chọn repository `Gritmode_BE`.
4. Render sẽ tự động đọc `render.yaml`, tạo Database, Redis, Web Service và tự động liên kết các biến môi trường `POSTGRES_URL` và `REDIS_URL`.

### Cách 2: Triển khai thủ công từng Service
1. **Database**: Bấm `+ New` ➔ `Postgres` ➔ Lấy `Internal Database URL`.
2. **Redis**: Bấm `+ New` ➔ `Key Value` ➔ Lấy `Internal Redis URL`.
3. **Web Service**: Bấm `+ New` ➔ `Web Service` ➔ Chọn Repo ➔ Chọn runtime **Docker** (Render sẽ tự động dùng `Dockerfile.prod`).
4. **Environment Variables**: Dán `POSTGRES_URL`, `REDIS_URL`, `JWT_SECRET`, và API keys gửi mail thật (`RESEND_API_KEY` hoặc `BREVO_API_KEY`).

---

## 🧪 5. Kiểm Thử (Testing)

- **Chạy toàn bộ Unit Tests:**
  ```bash
  npm run test:unit
  ```
- **Kiểm tra riêng tính năng Upload & MinIO Storage:**
  ```bash
  node --test tests/unit/services/storage.service.test.js
  node --test tests/unit/utils/image-upload.test.js
  ```
