BEGIN;

-- ============================================
-- CROP FOLLOWS (price alerts, stage 1)
--
-- A farmer or merchant follows a crop to receive price alerts. There is no
-- crops table in this schema: crops exist as normalised Title Case crop_name
-- strings on listings and price_history (see toTitleCaseCrop in
-- src/lib/constants.js), so the crop reference here is that same string.
--
-- alert_type:
--   any_change  alert on every price change for the crop
--   threshold   alert only when the price crosses threshold_value
-- threshold_value is in rupees per kg, matching price_history.price_per_kg,
-- the one unit every listing can be compared in.
--
-- One follow per user per crop. The stage 2 trigger on price_history will look
-- up followers by crop_name, hence the index.
-- ============================================

CREATE TABLE IF NOT EXISTS crop_follows (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name       text        NOT NULL,
  alert_type      text        NOT NULL DEFAULT 'any_change',
  threshold_value numeric,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT crop_follows_alert_type_chk CHECK (alert_type IN ('any_change', 'threshold')),
  -- A threshold follow must carry a positive limit; an any_change follow must not.
  CONSTRAINT crop_follows_threshold_chk CHECK (
    (alert_type = 'threshold'  AND threshold_value IS NOT NULL AND threshold_value > 0)
    OR
    (alert_type = 'any_change' AND threshold_value IS NULL)
  ),
  CONSTRAINT crop_follows_crop_name_len CHECK (char_length(crop_name) BETWEEN 1 AND 100),
  CONSTRAINT crop_follows_one_per_crop UNIQUE (user_id, crop_name)
);

CREATE INDEX IF NOT EXISTS crop_follows_crop_name_idx ON crop_follows (crop_name);
CREATE INDEX IF NOT EXISTS crop_follows_user_id_idx   ON crop_follows (user_id);

ALTER TABLE crop_follows ENABLE ROW LEVEL SECURITY;

-- Logged-out visitors have no business here at all.
REVOKE ALL ON crop_follows FROM anon;

-- Users manage only their own follows. The stage 2 trigger reads this table
-- through a SECURITY DEFINER function, so no cross-user SELECT policy is
-- needed by anyone.
CREATE POLICY "crop_follows_select_own" ON crop_follows
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "crop_follows_insert_own" ON crop_follows
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "crop_follows_update_own" ON crop_follows
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "crop_follows_delete_own" ON crop_follows
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Make PostgREST pick up the new table without a restart.
NOTIFY pgrst, 'reload schema';

COMMIT;
