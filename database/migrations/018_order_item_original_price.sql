-- Preserve the catalog price at checkout so completed orders can show sale savings historically.
ALTER TABLE order_item
  ADD COLUMN IF NOT EXISTS original_price_order_item bigint;

UPDATE order_item
SET original_price_order_item = price_order_item
WHERE original_price_order_item IS NULL;
