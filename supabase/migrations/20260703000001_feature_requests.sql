BEGIN;

-- ============================================
-- FEATURE REQUESTS
-- A logged-in farmer or merchant can submit a feature request and read back
-- only their own past requests. Admins can read every request and move it
-- through its lifecycle status. Row access is enforced entirely by RLS; the
-- admin paths reuse the existing is_admin() SECURITY DEFINER helper from
-- 20260612000001_users_select_lockdown.sql.
-- ============================================

CREATE TABLE IF NOT EXISTS feature_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_id is nullable and set to NULL (not cascade-deleted) when the account
  -- is removed, so the request itself survives. submitter_name is captured at
  -- submission time and kept on the row, so the admin panel can still show who
  -- asked even after the account is gone.
  user_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  role        text        NOT NULL,
  submitter_name text     NOT NULL,
  category    text        NOT NULL,
  title       text        NOT NULL,
  description text        NOT NULL,
  status      text        NOT NULL DEFAULT 'NEW',
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Input caps mirror the form limits so the database is the final guard.
  CONSTRAINT feature_requests_title_len       CHECK (char_length(title) BETWEEN 1 AND 100),
  CONSTRAINT feature_requests_description_len  CHECK (char_length(description) BETWEEN 20 AND 1000),
  CONSTRAINT feature_requests_category_chk     CHECK (category IN ('Pricing', 'Crops', 'Notifications', 'App Experience', 'Other')),
  CONSTRAINT feature_requests_status_chk       CHECK (status IN ('NEW', 'UNDER_REVIEW', 'PLANNED', 'REJECTED', 'DONE'))
);

CREATE INDEX IF NOT EXISTS feature_requests_user_id_idx    ON feature_requests (user_id);
CREATE INDEX IF NOT EXISTS feature_requests_created_at_idx ON feature_requests (created_at DESC);

ALTER TABLE feature_requests ENABLE ROW LEVEL SECURITY;

-- Anon has no business with this table at all. Deny the table privilege too,
-- not just via RLS, matching the defense-in-depth posture of the users lockdown.
REVOKE ALL ON feature_requests FROM anon;

-- A user may insert only rows that belong to them.
CREATE POLICY "feature_requests_insert_own" ON feature_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- A user may read only their own requests.
CREATE POLICY "feature_requests_read_own" ON feature_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins may read every request (the admin review panel).
CREATE POLICY "feature_requests_admin_read_all" ON feature_requests
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Only admins may update a request, and only ever an existing admin-owned view
-- of it: this is the status change in the admin review panel. Regular users get
-- no UPDATE policy, so they can never change a request after submitting it.
CREATE POLICY "feature_requests_admin_update" ON feature_requests
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Make PostgREST pick up the new table and policies without a restart.
NOTIFY pgrst, 'reload schema';

COMMIT;
