ALTER TABLE product_image
  ADD COLUMN IF NOT EXISTS cloudinary_public_id text,
  ADD COLUMN IF NOT EXISTS cloudinary_source_public_id text,
  ADD COLUMN IF NOT EXISTS cloudinary_source_url text,
  ADD COLUMN IF NOT EXISTS crop_profile varchar(32),
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer,
  ADD COLUMN IF NOT EXISTS image_format varchar(16);

ALTER TABLE collection
  ADD COLUMN IF NOT EXISTS cloudinary_public_id text,
  ADD COLUMN IF NOT EXISTS cloudinary_source_public_id text,
  ADD COLUMN IF NOT EXISTS cloudinary_source_url text,
  ADD COLUMN IF NOT EXISTS crop_profile varchar(32),
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer,
  ADD COLUMN IF NOT EXISTS image_format varchar(16);

ALTER TABLE banners
  ADD COLUMN IF NOT EXISTS cloudinary_public_id text,
  ADD COLUMN IF NOT EXISTS cloudinary_source_public_id text,
  ADD COLUMN IF NOT EXISTS cloudinary_source_url text,
  ADD COLUMN IF NOT EXISTS crop_profile varchar(32),
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer,
  ADD COLUMN IF NOT EXISTS image_format varchar(16);

CREATE TABLE IF NOT EXISTS media_assets (
  media_asset_id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL UNIQUE,
  cloudinary_source_public_id TEXT,
  cloudinary_source_url TEXT,
  asset_type VARCHAR(32) NOT NULL CHECK (asset_type IN ('product','collection','banner')),
  crop_profile VARCHAR(32) NOT NULL CHECK (crop_profile IN ('product','collection','banner')),
  image_width INTEGER NOT NULL CHECK (image_width > 0),
  image_height INTEGER NOT NULL CHECK (image_height > 0),
  image_format VARCHAR(16) NOT NULL,
  original_name TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','attached','cleanup_pending','deleted')),
  attached_record_type VARCHAR(32),
  attached_record_id BIGINT,
  cleanup_attempts INTEGER NOT NULL DEFAULT 0,
  cleanup_error TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS media_assets_status_idx ON media_assets(status, expires_at);
CREATE INDEX IF NOT EXISTS media_assets_source_idx ON media_assets(cloudinary_source_public_id);
