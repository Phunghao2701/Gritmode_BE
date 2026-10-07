-- Migration 015: Allow administrators to hide individual product option values.

ALTER TABLE product_option_value
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_product_option_value_hidden
  ON product_option_value(product_option_id, is_hidden);
