-- 012_banner_management.sql
-- Tạo bảng quản lý hero banners cho trang chủ và các chiến dịch marketing của Gritmode

CREATE TABLE IF NOT EXISTS banners (
  banner_id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  link_url VARCHAR(500) DEFAULT '/products?sort=newest',
  marquee_text VARCHAR(500),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_banners_active_order ON banners (is_active, sort_order ASC, created_at DESC);
