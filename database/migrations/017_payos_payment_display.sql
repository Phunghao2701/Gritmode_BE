-- Store the provider-supplied transfer details used by the custom payment card.
-- These values are display data only; payment settlement remains webhook/polling verified.
ALTER TABLE payment
  ADD COLUMN IF NOT EXISTS payos_bank_name varchar(120),
  ADD COLUMN IF NOT EXISTS payos_account_number varchar(80),
  ADD COLUMN IF NOT EXISTS payos_account_name varchar(255),
  ADD COLUMN IF NOT EXISTS payos_transfer_description varchar(255);
