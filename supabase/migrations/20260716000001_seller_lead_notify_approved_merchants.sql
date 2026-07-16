BEGIN;

-- ============================================
-- SELLER LEAD FAN-OUT: APPROVED, NON-DISABLED MERCHANTS ONLY
--
-- seller_lead_notify_merchants (20260714000001) fanned a new seller lead out
-- to every merchant_id that had ever appeared in price_history, with no check
-- on that merchant's current standing. A merchant who was later rejected or
-- disabled, but who had posted a price at some point, kept receiving lead
-- notifications (in-app and push) indefinitely.
--
-- This migration replaces the function body so the fan-out joins
-- price_history to users and keeps only merchants that are currently APPROVED
-- and not disabled. That is the same standing gate the rest of the schema
-- already uses: see listings_merchant_insert and price_history_merchant_insert
-- in 20260605000001, and users_read_approved_merchants in 20260612000001.
--
-- role = 'MERCHANT' is deliberately not added to the filter. status
-- 'APPROVED' is only ever set on merchant rows (handle_new_user gives farmers
-- 'ACTIVE'), so the role test would be redundant.
--
-- Scope: the function body is the only thing that changes. The trigger
-- seller_lead_notify_merchants_trg on seller_leads keeps its existing
-- binding, because CREATE OR REPLACE FUNCTION swaps the body in place; the
-- trigger is deliberately not dropped or recreated here. No table, column,
-- grant or RLS policy is touched, and no other trigger is touched.
--
-- The function stays SECURITY DEFINER. It now reads public.users in addition
-- to public.price_history, but only to test status and is_disabled for this
-- filter: no users column reaches the notifications row (farmer_name comes
-- from NEW, stamped earlier by seller_leads_before_insert), so this exposes
-- nothing to any client that was not already exposed.
--
-- No NOTIFY pgrst here: this file adds no table, column or callable RPC, so
-- there is no PostgREST schema change to pick up.
-- ============================================

CREATE OR REPLACE FUNCTION public.seller_lead_notify_merchants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, farmer_name, seller_lead_id)
  SELECT DISTINCT ph.merchant_id, 'seller_lead', NEW.farmer_name, NEW.id
  FROM public.price_history ph
  JOIN public.users u ON u.id = ph.merchant_id
  WHERE u.status = 'APPROVED'
    AND u.is_disabled IS NOT TRUE;

  RETURN NEW;
END;
$$;

-- Defensive and idempotent. CREATE OR REPLACE on an already existing function
-- preserves its ACL, so the REVOKE from 20260714000001 still holds and this
-- line is a no-op there. It matters only if this file is ever run where the
-- function did not already exist, in which case CREATE would have granted
-- EXECUTE to PUBLIC by default.
REVOKE EXECUTE ON FUNCTION public.seller_lead_notify_merchants() FROM PUBLIC;

COMMIT;
