ALTER TABLE product_variant
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Existing archived products already represent soft-deleted catalog entries.
-- Keep variant rows for order history while allowing their SKUs to be reused.
UPDATE product_variant pv
SET deleted_at = COALESCE(pv.deleted_at, p.updated_at, NOW())
FROM product p
WHERE p.product_id = pv.product_id
  AND p.status_product = 'archived';

-- Cart items are temporary references and must not remain purchasable after
-- their product has been archived.
DELETE FROM cart_item ci
USING product_variant pv, product p
WHERE ci.product_variant_id = pv.product_variant_id
  AND p.product_id = pv.product_id
  AND p.status_product = 'archived';

ALTER TABLE product_variant
  DROP CONSTRAINT IF EXISTS product_variant_sku_key;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM product_variant
    WHERE deleted_at IS NULL
    GROUP BY LOWER(BTRIM(sku))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create active SKU index: duplicate active product_variant SKUs exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variant_active_sku
  ON product_variant (LOWER(BTRIM(sku)))
  WHERE deleted_at IS NULL;
