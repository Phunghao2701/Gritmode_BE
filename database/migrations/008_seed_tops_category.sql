-- Initial storefront taxonomy: Tops -> Áo thun.
-- This is a separate data migration and is safe to run repeatedly.
INSERT INTO category (name_category, slug_category, description_category, position_category, is_active, created_at, updated_at)
SELECT 'Tops', 'tops', 'Các sản phẩm áo và trang phục phần thân trên', 0, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM category WHERE slug_category = 'tops');

UPDATE category
SET parent_category_id = (SELECT category_id FROM category WHERE slug_category = 'tops' LIMIT 1),
    updated_at = NOW()
WHERE slug_category = 'ao-thun'
  AND parent_category_id IS DISTINCT FROM (SELECT category_id FROM category WHERE slug_category = 'tops' LIMIT 1);
