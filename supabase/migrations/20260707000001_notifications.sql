BEGIN;

-- ============================================
-- IN-APP NOTIFICATIONS (price alerts, stage 2)
--
-- One row per alert delivered to one user. Rows are created ONLY by the
-- price_history trigger below; clients can read their own rows and mark them
-- read (a column grant limits their UPDATE to read_at), nothing else.
-- crop_name is the same crop reference convention as crop_follows.
--
-- No pre-rendered sentence is stored. The row carries the raw facts (crop,
-- old price, new price, merchant business name at alert time) and the app
-- renders the sentence client side through i18n, in the reader's language.
-- old_price is null for a merchant's first ever price for the crop; new_price
-- is null when the merchant moved the crop to call-for-price.
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name     text        NOT NULL,
  old_price     numeric,
  new_price     numeric,
  merchant_name text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx  ON notifications (user_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Clients may read their own notifications and set read_at on them. They may
-- never insert or delete: the trigger is the only writer, so a user cannot
-- forge notifications for themselves or anyone else.
REVOKE ALL ON notifications FROM anon;
REVOKE ALL ON notifications FROM authenticated;
GRANT SELECT ON notifications TO authenticated;
GRANT UPDATE (read_at) ON notifications TO authenticated;

CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Required for the frontend realtime subscription (useRealtimeNotifications)
-- to receive postgres_changes events at all. Supabase only broadcasts changes
-- for tables added to this publication; RLS still applies on top, so a client
-- only ever receives events for its own rows.
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;


-- ============================================
-- TRIGGER: fan a price_history insert out to followers
--
-- SECURITY DEFINER, but scoped to exactly this lookup: it reads crop_follows
-- rows for ONE crop name, reads one users.business_name, reads the previous
-- price_history row for the same merchant and crop, and inserts notifications.
-- EXECUTE is revoked from every client role, and a trigger function returning
-- trigger cannot be called through the API anyway, so this grants no general
-- RLS bypass to anyone.
--
-- Rules:
--   1) If the new per-kg value equals the previous one for this merchant and
--      crop, do nothing. Daily "confirm today's prices" rewrites the same
--      value; that is not a price change.
--   2) any_change followers are notified on any real change, including a move
--      to or from call-for-price (a null per-kg value).
--   3) threshold followers are notified only when the numeric per-kg price
--      crosses their limit: it was below and is now at or above, or was above
--      and is now at or below. The first ever price for a crop (no previous
--      row) never fires threshold alerts: nothing has crossed anything yet.
--      Crossing checks begin from the second price onward.
--   4) The author of the price is always excluded: a merchant is never
--      notified about their own entry (rule requested for merchant followers;
--      farmers can never author price_history rows, so it only bites there).
-- ============================================

CREATE OR REPLACE FUNCTION public.price_history_notify_followers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  prev_per_kg numeric;
  merch_name  text;
BEGIN
  -- The previous price this merchant recorded for this crop, if any.
  SELECT ph.price_per_kg INTO prev_per_kg
  FROM public.price_history ph
  WHERE ph.merchant_id = NEW.merchant_id
    AND ph.crop_name   = NEW.crop_name
    AND ph.id <> NEW.id
  ORDER BY ph.recorded_at DESC
  LIMIT 1;

  -- Same value as before: a re-confirmation, not a change. Say nothing.
  IF NEW.price_per_kg IS NOT DISTINCT FROM prev_per_kg THEN
    RETURN NEW;
  END IF;

  SELECT u.business_name INTO merch_name FROM public.users u WHERE u.id = NEW.merchant_id;

  -- Raw facts only; the app renders the sentence in the reader's language.
  INSERT INTO public.notifications (user_id, crop_name, old_price, new_price, merchant_name)
  SELECT f.user_id, NEW.crop_name, prev_per_kg, NEW.price_per_kg, merch_name
  FROM public.crop_follows f
  WHERE f.crop_name = NEW.crop_name
    AND f.user_id <> NEW.merchant_id
    AND (
      f.alert_type = 'any_change'
      OR (
        f.alert_type = 'threshold'
        AND prev_per_kg IS NOT NULL
        AND NEW.price_per_kg IS NOT NULL
        AND (
             (prev_per_kg < f.threshold_value AND NEW.price_per_kg >= f.threshold_value)
          OR (prev_per_kg > f.threshold_value AND NEW.price_per_kg <= f.threshold_value)
        )
      )
    );

  RETURN NEW;
END;
$$;

-- Nobody calls this directly; only the trigger does.
REVOKE EXECUTE ON FUNCTION public.price_history_notify_followers() FROM PUBLIC;

DROP TRIGGER IF EXISTS price_history_notify_followers_trg ON price_history;
CREATE TRIGGER price_history_notify_followers_trg
  AFTER INSERT ON price_history
  FOR EACH ROW
  EXECUTE FUNCTION public.price_history_notify_followers();

-- Make PostgREST pick up the new table without a restart.
NOTIFY pgrst, 'reload schema';

COMMIT;
