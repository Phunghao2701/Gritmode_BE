ALTER TABLE product
  ADD COLUMN IF NOT EXISTS slug_product varchar(255);

-- Backfill slug_product if empty or null
UPDATE product
SET slug_product = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name_product, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', ''))
WHERE slug_product IS NULL OR slug_product = '';

CREATE INDEX IF NOT EXISTS idx_product_slug_product ON product(slug_product);
CREATE INDEX IF NOT EXISTS idx_product_status ON product(status_product);
CREATE INDEX IF NOT EXISTS idx_product_variant_price ON product_variant(price, product_id);
