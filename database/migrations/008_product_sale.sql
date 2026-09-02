ALTER TABLE product
  ADD COLUMN IF NOT EXISTS sale_price bigint,
  ADD COLUMN IF NOT EXISTS sale_start_at timestamp,
  ADD COLUMN IF NOT EXISTS sale_end_at timestamp;

ALTER TABLE product DROP CONSTRAINT IF EXISTS product_sale_price_check;
ALTER TABLE product ADD CONSTRAINT product_sale_price_check CHECK (sale_price IS NULL OR sale_price >= 0);

ALTER TABLE product DROP CONSTRAINT IF EXISTS product_sale_period_check;
ALTER TABLE product ADD CONSTRAINT product_sale_period_check
  CHECK (sale_start_at IS NULL OR sale_end_at IS NULL OR sale_end_at > sale_start_at);
