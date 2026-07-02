BEGIN;

-- ============================================
-- SECURITY CONSTRAINTS
-- Applied to production on 2026-07-03 (sections 1 and 2).
--
-- Section 3 was checked against the live database before running:
-- no INSERT policy and no INSERT grant existed for anon or
-- authenticated on public.users. There was nothing to drop or
-- revoke. The lines are kept only as a safety net if this file
-- is ever run on a fresh environment. On current production
-- they change nothing.
--
-- 1) One review per (farmer_id, merchant_id) pair.
-- 2) Length caps on user-typed text columns.
-- 3) Users INSERT lockdown (verified as already in place).
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_farmer_merchant
  ON reviews (farmer_id, merchant_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_business_name_len') THEN
    ALTER TABLE users ADD CONSTRAINT users_business_name_len
      CHECK (char_length(business_name) <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_business_description_len') THEN
    ALTER TABLE users ADD CONSTRAINT users_business_description_len
      CHECK (char_length(business_description) <= 1000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_owner_name_len') THEN
    ALTER TABLE users ADD CONSTRAINT users_owner_name_len
      CHECK (char_length(owner_name) <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_crop_name_len') THEN
    ALTER TABLE listings ADD CONSTRAINT listings_crop_name_len
      CHECK (char_length(crop_name) <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_notes_len') THEN
    ALTER TABLE listings ADD CONSTRAINT listings_notes_len
      CHECK (char_length(notes) <= 500);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_full_name_len') THEN
    ALTER TABLE users ADD CONSTRAINT users_full_name_len
      CHECK (char_length(full_name) <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_town_len') THEN
    ALTER TABLE users ADD CONSTRAINT users_town_len
      CHECK (char_length(town) <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_variety_notes_len') THEN
    ALTER TABLE listings ADD CONSTRAINT listings_variety_notes_len
      CHECK (char_length(variety_notes) <= 500);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_comment_len') THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_comment_len
      CHECK (char_length(comment) <= 1000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_author_name_len') THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_author_name_len
      CHECK (char_length(author_name) <= 100);
  END IF;
END $$;

DROP POLICY IF EXISTS "Anyone can insert user" ON users;
REVOKE INSERT ON users FROM anon;
REVOKE INSERT ON users FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
