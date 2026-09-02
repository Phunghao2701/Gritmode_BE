-- Forward-only alignment for databases created from older migrations.
ALTER TABLE category ADD COLUMN IF NOT EXISTS parent_category_id bigint REFERENCES category(category_id);
ALTER TABLE category ADD COLUMN IF NOT EXISTS slug_category varchar(255);
ALTER TABLE category ADD COLUMN IF NOT EXISTS description_category text;
ALTER TABLE category ADD COLUMN IF NOT EXISTS position_category int NOT NULL DEFAULT 0;
ALTER TABLE category ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE collection ADD COLUMN IF NOT EXISTS slug_collection varchar(255);
ALTER TABLE collection ADD COLUMN IF NOT EXISTS description_collection text;
ALTER TABLE collection ADD COLUMN IF NOT EXISTS image_collection varchar(1000);
ALTER TABLE collection ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE collection ADD COLUMN IF NOT EXISTS start_at timestamp;
ALTER TABLE collection ADD COLUMN IF NOT EXISTS end_at timestamp;
ALTER TABLE product_collection ADD COLUMN IF NOT EXISTS position_product_collection int NOT NULL DEFAULT 0;
ALTER TABLE product_image ADD COLUMN IF NOT EXISTS alt_product_image varchar(255);
ALTER TABLE payment ADD COLUMN IF NOT EXISTS payos_transaction_reference varchar(255);
DO $$ BEGIN ALTER TYPE status_payment ADD VALUE IF NOT EXISTS 'processing'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE status_payment ADD VALUE IF NOT EXISTS 'expired'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
