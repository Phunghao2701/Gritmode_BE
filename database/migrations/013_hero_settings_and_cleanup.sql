-- 013_hero_settings_and_cleanup.sql
-- Tách riêng bảng hero_settings cho tiêu đề, mô tả, marquee chung của trang chủ
-- và dọn dẹp mock data ảnh trong banners

CREATE TABLE IF NOT EXISTS hero_settings (
  id INT PRIMARY KEY DEFAULT 1,
  subtitle VARCHAR(255) DEFAULT 'SEASON DROP 2026',
  title VARCHAR(255) DEFAULT 'GRITMODE SIGNATURE',
  description TEXT DEFAULT 'Thời trang đường phố Việt Nam định hình phong cách độc bản, tự do và đậm chất bụi bặm.',
  marquee_text VARCHAR(500) DEFAULT '🔥 BỘ SƯU TẬP SIGNATURE STREETWEAR DROP 2026 • 100% PREMIUM HEAVYWEIGHT COTTON 280GSM • MIỄN PHÍ VẬN CHUYỂN TOÀN QUỐC',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT single_hero_settings CHECK (id = 1)
);

INSERT INTO hero_settings (id, subtitle, title, description, marquee_text)
VALUES (
  1,
  'SEASON DROP 2026',
  'GRITMODE SIGNATURE',
  'Thời trang đường phố Việt Nam định hình phong cách độc bản, tự do và đậm chất bụi bặm.',
  '🔥 BỘ SƯU TẬP SIGNATURE STREETWEAR DROP 2026 • 100% PREMIUM HEAVYWEIGHT COTTON 280GSM • MIỄN PHÍ VẬN CHUYỂN TOÀN QUỐC'
)
ON CONFLICT (id) DO NOTHING;

-- Dọn dẹp toàn bộ mock data ảnh unsplash
DELETE FROM banners WHERE image_url LIKE '%unsplash.com%';
