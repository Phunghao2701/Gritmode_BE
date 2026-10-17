-- Align legacy databases with the catalog schema.
-- The repository also deletes links explicitly so this remains safe while
-- deployments are rolling forward to the corrected constraint.
ALTER TABLE product_variant_option_value
  DROP CONSTRAINT IF EXISTS product_variant_option_value_product_variant_id_fkey;

ALTER TABLE product_variant_option_value
  ADD CONSTRAINT product_variant_option_value_product_variant_id_fkey
  FOREIGN KEY (product_variant_id)
  REFERENCES product_variant(product_variant_id)
  ON DELETE CASCADE;
