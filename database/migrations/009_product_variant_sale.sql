ALTER TABLE product_variant
  ADD COLUMN IF NOT EXISTS sale_price bigint,
  ADD COLUMN IF NOT EXISTS sale_start_at timestamp,
  ADD COLUMN IF NOT EXISTS sale_end_at timestamp;

ALTER TABLE product_variant DROP CONSTRAINT IF EXISTS product_variant_sale_price_check;
ALTER TABLE product_variant ADD CONSTRAINT product_variant_sale_price_check CHECK (sale_price IS NULL OR sale_price >= 0);

ALTER TABLE product_variant DROP CONSTRAINT IF EXISTS product_variant_sale_period_check;
ALTER TABLE product_variant ADD CONSTRAINT product_variant_sale_period_check
  CHECK (sale_start_at IS NULL OR sale_end_at IS NULL OR sale_end_at > sale_start_at);
