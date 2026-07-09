BEGIN;

-- ============================================
-- PUSH SUBSCRIPTIONS (price alerts, stage 3)
--
-- One row per browser push subscription a user has granted. A single user can
-- have several (phone, laptop, etc.). endpoint is the push service URL that
-- identifies the subscription; keys holds the p256dh and auth values the web
-- push protocol needs to encrypt the payload. The send-push Edge Function reads
-- these rows through the service role (which bypasses RLS) to deliver alerts.
--
-- RLS follows the exact own-rows-only pattern of crop_follows: a user manages
-- only their own subscriptions and can never see anyone else's.
-- ============================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL,
  keys       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- The endpoint uniquely identifies a subscription. Re-subscribing on the same
  -- device upserts on this key instead of piling up duplicate rows.
  CONSTRAINT push_subscriptions_endpoint_uniq UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Logged-out visitors have no business here at all.
REVOKE ALL ON push_subscriptions FROM anon;

CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions_update_own" ON push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Make PostgREST pick up the new table without a restart.
NOTIFY pgrst, 'reload schema';

COMMIT;
