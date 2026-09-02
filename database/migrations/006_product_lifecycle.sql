-- Product lifecycle migration. Existing complete catalog products remain public;
-- incomplete rows become drafts and can be finished safely in Admin.
DO $$
DECLARE
  status_column_was_missing boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_product') THEN
    CREATE TYPE status_product AS ENUM ('draft', 'active', 'archived');
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product' AND column_name = 'status_product'
  ) INTO status_column_was_missing;

  ALTER TABLE product
    ADD COLUMN IF NOT EXISTS status_product status_product NOT NULL DEFAULT 'draft';

  IF status_column_was_missing THEN
    UPDATE product p
    SET status_product = 'active'
    WHERE EXISTS (SELECT 1 FROM product_variant pv WHERE pv.product_id = p.product_id)
      AND EXISTS (SELECT 1 FROM product_image pi WHERE pi.product_id = p.product_id)
      AND EXISTS (SELECT 1 FROM product_category pc WHERE pc.product_id = p.product_id AND pc.is_primary = true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_status_created_at
  ON product(status_product, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_one_primary_category
  ON product_category(product_id)
  WHERE is_primary = true;
