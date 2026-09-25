-- Performance indexes for inventory, sessions, orders, and product lookups
CREATE INDEX IF NOT EXISTS idx_inventory_updated_at ON inventory(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_variant_stock ON inventory(product_variant_id, quantity_stock, quantity_reserved);
CREATE INDEX IF NOT EXISTS idx_product_variant_product_id ON product_variant(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variant_sku ON product_variant(sku);

CREATE INDEX IF NOT EXISTS idx_user_session_active ON user_session(refresh_token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_session_user_id ON user_session(user_id);

CREATE INDEX IF NOT EXISTS idx_product_category_cat_id ON product_category(category_id);
CREATE INDEX IF NOT EXISTS idx_product_collection_col_id ON product_collection(collection_id);

CREATE INDEX IF NOT EXISTS idx_order_user_id ON "order"(user_id);
CREATE INDEX IF NOT EXISTS idx_order_created_at ON "order"(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_status ON "order"(status_order);
