BEGIN;

-- ============================================
-- DAILY STALE PRICE REMINDER
--
-- One notification per merchant per day when their prices have gone stale.
--
-- Staleness is measured on listings.confirmed_at, NOT on
-- price_history.recorded_at. confirmed_at is what the product actually shows
-- (FreshnessBadge, the feed's last_confirmed_at grouping, the dashboard's
-- lastConfirmedLabel) and what "Confirm today's prices" writes. Editing a
-- price appends price_history without touching confirmed_at, so a reminder
-- keyed on recorded_at would contradict the badge the merchant is looking at.
--
-- SEE THE FLAG IN THE REVIEW NOTES: listings.confirmed_at is not defined in
-- any migration in this repo. This file assumes it exists in the live database
-- with the name and type the app code implies.
--
-- The 20 hour NOT EXISTS guard is the only thing standing between this job and
-- spamming every merchant on every run. It is evaluated against the statement
-- snapshot, so it cannot see this statement's own inserts; SELECT DISTINCT
-- collapses a merchant with several stale listings to one row. Together that
-- gives exactly one reminder per merchant per run, and the 20 hour window
-- against a 24 hour schedule leaves slack for a late or retried run without
-- ever allowing two reminders in one day.
-- ============================================

CREATE OR REPLACE FUNCTION public.notify_stale_price_merchants()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted integer;
BEGIN
  INSERT INTO public.notifications (user_id, type)
  SELECT DISTINCT u.id, 'price_reminder'
  FROM public.users u
  JOIN public.listings l ON l.merchant_id = u.id
  WHERE u.status = 'APPROVED'
    AND u.is_disabled IS NOT TRUE
    AND l.is_active = true
    AND (l.confirmed_at IS NULL OR l.confirmed_at < now() - INTERVAL '48 hours')
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = u.id
        AND n.type = 'price_reminder'
        AND n.created_at > now() - INTERVAL '20 hours'
    );

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

-- Called by pg_cron as the job owner, never by a client.
REVOKE EXECUTE ON FUNCTION public.notify_stale_price_merchants() FROM PUBLIC;

COMMIT;

-- ============================================
-- SCHEDULE
--
-- Outside the transaction above: cron.schedule writes to the cron schema and
-- is not part of the notifications change if it needs to be rolled back.
--
-- Idempotent: unschedule an existing job of the same name first, so re running
-- this file does not stack duplicate jobs.
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stale-price-reminder') THEN
    PERFORM cron.unschedule('stale-price-reminder');
  END IF;
END $$;

SELECT cron.schedule(
  'stale-price-reminder',
  '30 1 * * *',
  $$SELECT public.notify_stale_price_merchants();$$
);
