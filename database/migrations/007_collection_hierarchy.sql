-- Add a nullable self-reference so collections can be grouped as parent -> child.
ALTER TABLE collection
  ADD COLUMN IF NOT EXISTS parent_collection_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collection_parent_collection_id_fkey'
  ) THEN
    ALTER TABLE collection
      ADD CONSTRAINT collection_parent_collection_id_fkey
      FOREIGN KEY (parent_collection_id)
      REFERENCES collection(collection_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_collection_parent_collection_id
  ON collection(parent_collection_id);

