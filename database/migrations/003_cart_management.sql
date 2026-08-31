-- Issue 09: enforce cart ownership and quantity invariants at database level.
DO $$ BEGIN
  ALTER TABLE cart ADD CONSTRAINT ck_cart_exactly_one_owner
    CHECK ((user_id IS NOT NULL AND guest_token IS NULL) OR
           (user_id IS NULL AND guest_token IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cart_item ADD CONSTRAINT ck_cart_item_positive_quantity
    CHECK (quantity_cart_item > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_active_user
  ON cart(user_id)
  WHERE status_cart='active' AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cart_owner_status
  ON cart(user_id,guest_token,status_cart);

CREATE INDEX IF NOT EXISTS idx_cart_item_cart_created
  ON cart_item(cart_id,created_at,cart_item_id);
