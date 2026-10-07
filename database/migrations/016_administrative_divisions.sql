-- Official Vietnam administrative divisions snapshot.
-- Source: https://danhmuchanhchinh.nso.gov.vn/DMDVHC.asmx
-- Existing address text columns are intentionally preserved for historical orders.

CREATE TABLE IF NOT EXISTS administrative_dataset (
  administrative_dataset_id BIGSERIAL PRIMARY KEY,
  source_name VARCHAR(120) NOT NULL,
  effective_date DATE NOT NULL,
  source_url TEXT NOT NULL,
  checksum_sha256 CHAR(64),
  province_count INTEGER NOT NULL DEFAULT 0 CHECK (province_count >= 0),
  commune_count INTEGER NOT NULL DEFAULT 0 CHECK (commune_count >= 0),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_name, effective_date)
);

CREATE TABLE IF NOT EXISTS administrative_province (
  administrative_dataset_id BIGINT NOT NULL REFERENCES administrative_dataset(administrative_dataset_id) ON DELETE CASCADE,
  province_code VARCHAR(20) NOT NULL,
  province_name VARCHAR(200) NOT NULL,
  administrative_type VARCHAR(120),
  urban_type VARCHAR(120),
  region_name VARCHAR(120),
  PRIMARY KEY (administrative_dataset_id, province_code)
);

CREATE TABLE IF NOT EXISTS administrative_commune (
  administrative_dataset_id BIGINT NOT NULL,
  province_code VARCHAR(20) NOT NULL,
  district_code VARCHAR(20),
  district_name VARCHAR(200),
  commune_code VARCHAR(20) NOT NULL,
  commune_name VARCHAR(200) NOT NULL,
  administrative_type VARCHAR(120),
  urban_type VARCHAR(120),
  region_name VARCHAR(120),
  rural_urban_type VARCHAR(120),
  area_type VARCHAR(120),
  PRIMARY KEY (administrative_dataset_id, commune_code),
  CONSTRAINT administrative_commune_province_fk
    FOREIGN KEY (administrative_dataset_id, province_code)
    REFERENCES administrative_province(administrative_dataset_id, province_code)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS administrative_dataset_latest_idx
  ON administrative_dataset (effective_date DESC, synced_at DESC);

CREATE INDEX IF NOT EXISTS administrative_commune_lookup_idx
  ON administrative_commune (administrative_dataset_id, province_code, commune_name);

ALTER TABLE user_address
  ADD COLUMN IF NOT EXISTS province_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS commune_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS administrative_dataset_id BIGINT;

ALTER TABLE order_address
  ADD COLUMN IF NOT EXISTS province_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS commune_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS administrative_dataset_id BIGINT;

CREATE INDEX IF NOT EXISTS user_address_province_code_idx
  ON user_address (province_code, commune_code);

CREATE INDEX IF NOT EXISTS order_address_province_code_idx
  ON order_address (province_code, commune_code);

COMMENT ON TABLE administrative_dataset IS 'Versioned snapshots downloaded from the official NSO administrative divisions service.';
COMMENT ON COLUMN order_address.administrative_dataset_id IS 'Snapshot used when this order address was captured; retained for historical accuracy.';
