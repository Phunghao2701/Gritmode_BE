# Gritmode Backend

Express 5 + PostgreSQL API cho shop quần áo Gritmode. Milestone hiện tại triển khai Authentication, profile, address, session và guest-cart merge.

## Setup

Yêu cầu Node.js 22+ và PostgreSQL 15+/Supabase.

1. Copy `.env.example` thành `.env` và thay placeholder.
2. Chạy `npm ci`.
3. Review `database/migrations/001_authentication.sql`.
4. Chạy `npm run db:migrate` trên development/staging database trước.
5. Chạy `npm run dev`.

Base path: `/api/v1`; health check: `GET /api/v1/health`.

Swagger UI: `http://localhost:5000/api-docs/`  
Raw OpenAPI: `http://localhost:5000/api-docs/openapi.yaml`

Access token được trả trong response và dùng qua Bearer header. Refresh token nằm trong cookie `HttpOnly`; DB chỉ lưu SHA-256 hash. Local password dùng bcrypt cost 12. Google ID token được backend xác minh. Login có thể nhận `guest_token`; cart merge chạy transaction và từ chối nếu vượt tồn kho.

API contract: [`openapi/authentication.yaml`](openapi/authentication.yaml).

```text
npm run db:migrate
npm run test:unit
npm run test:integration
npm run test:smoke
npm run test:coverage
```

Không chạy migration trực tiếp trên production nếu chưa backup và thử trên staging.
