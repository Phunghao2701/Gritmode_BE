-- Link legacy guest checkouts to the matching verified account.
-- Older authenticated checkouts could persist user_id as NULL while keeping
-- the account email, which made profile order history and contact data appear
-- empty after login.
UPDATE "order" o
SET user_id = u.user_id,
    updated_at = NOW()
FROM "user" u
WHERE o.user_id IS NULL
  AND LOWER(TRIM(o.email_order)) = LOWER(TRIM(u.email));

-- Recover the account phone when it is still empty. Do not violate the unique
-- phone constraint if the number is already owned by another account.
WITH latest_contact AS (
  SELECT DISTINCT ON (o.user_id)
    o.user_id,
    NULLIF(TRIM(o.phone_order), '') AS phone
  FROM "order" o
  WHERE o.user_id IS NOT NULL
  ORDER BY o.user_id, o.created_at DESC NULLS LAST, o.order_id DESC
), eligible_contact AS (
  SELECT
    latest_contact.user_id,
    latest_contact.phone,
    ROW_NUMBER() OVER (
      PARTITION BY latest_contact.phone
      ORDER BY latest_contact.user_id
    ) AS phone_rank
  FROM latest_contact
  JOIN "user" u ON u.user_id = latest_contact.user_id
  WHERE u.phone IS NULL
    AND latest_contact.phone IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "user" other_user
      WHERE other_user.phone = latest_contact.phone
        AND other_user.user_id <> latest_contact.user_id
    )
)
UPDATE "user" u
SET phone = eligible_contact.phone,
    updated_at = NOW()
FROM eligible_contact
WHERE eligible_contact.phone_rank = 1
  AND u.user_id = eligible_contact.user_id;

-- Create one default saved address for accounts that have order snapshots but
-- no address book entry yet. Existing saved addresses are left untouched.
WITH latest_address AS (
  SELECT DISTINCT ON (o.user_id)
    o.user_id,
    oa.receiver_name_order_address,
    oa.phone_order_address,
    oa.address_line_order_address,
    oa.ward_order_address,
    oa.district_order_address,
    oa.province_order_address
  FROM "order" o
  JOIN order_address oa ON oa.order_id = o.order_id
  WHERE o.user_id IS NOT NULL
  ORDER BY o.user_id, o.created_at DESC NULLS LAST, o.order_id DESC
)
INSERT INTO user_address (
  user_id,
  receiver_name_user_address,
  phone_user_address,
  address_line_user_address,
  ward_user_address,
  district_user_address,
  province_user_address,
  is_default,
  created_at,
  updated_at
)
SELECT
  latest_address.user_id,
  latest_address.receiver_name_order_address,
  latest_address.phone_order_address,
  latest_address.address_line_order_address,
  latest_address.ward_order_address,
  latest_address.district_order_address,
  latest_address.province_order_address,
  true,
  NOW(),
  NOW()
FROM latest_address
WHERE NOT EXISTS (
  SELECT 1
  FROM user_address existing_address
  WHERE existing_address.user_id = latest_address.user_id
);
