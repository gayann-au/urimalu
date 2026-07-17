BEGIN;

-- ============================================
-- SELLER LEAD RESPONSE NOTIFICATION
--
-- Closes the one way loop: a farmer posting a lead notified every merchant,
-- but nothing ever told the farmer that a merchant responded.
--
-- The farmer reference on seller_leads is farmer_id (uuid, REFERENCES
-- users(id)), confirmed against 20260714000001.
--
-- Reuses existing columns: merchant_name (the responding merchant's
-- business_name, the same raw fact the price alert trigger stores) and
-- seller_lead_id. No new column.
--
-- Duplicate safety comes from the table, not from this function.
-- seller_lead_reads has UNIQUE (merchant_id, seller_lead_id) and the client
-- upserts with ON CONFLICT DO NOTHING (useMarkSellerLeadRead). An AFTER INSERT
-- trigger does not fire for a row that conflict resolution skipped, so one
-- merchant opening one lead produces exactly one notification no matter how
-- many times they tap.
--
-- Semantics worth knowing: SellerLeadsTab writes a read receipt on card tap as
-- well as on Call and WhatsApp, so this fires on "opened", not on "contacted".
--
-- SECURITY DEFINER with a pinned search_path and EXECUTE revoked from PUBLIC,
-- same pattern as seller_lead_notify_merchants. It is required here rather
-- than optional: the farmer's own row is not readable by the merchant under
-- the users RLS, and notifications has no INSERT grant for any client role.
-- ============================================

CREATE OR REPLACE FUNCTION public.seller_lead_read_notify_farmer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  lead_farmer_id uuid;
  merch_name     text;
BEGIN
  SELECT sl.farmer_id INTO lead_farmer_id
  FROM public.seller_leads sl
  WHERE sl.id = NEW.seller_lead_id;

  -- Lead gone (or unreadable): nothing to notify anyone about.
  IF lead_farmer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Never notify someone about their own action. The RLS insert policy already
  -- restricts this table to merchants, so this only bites if that ever changes.
  IF lead_farmer_id = NEW.merchant_id THEN
    RETURN NEW;
  END IF;

  -- May be null; the constraint does not require it and the app renders a
  -- fallback, exactly as it does for a price alert.
  SELECT u.business_name INTO merch_name
  FROM public.users u
  WHERE u.id = NEW.merchant_id;

  INSERT INTO public.notifications (user_id, type, merchant_name, seller_lead_id)
  VALUES (lead_farmer_id, 'seller_lead_response', merch_name, NEW.seller_lead_id);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seller_lead_read_notify_farmer() FROM PUBLIC;

DROP TRIGGER IF EXISTS seller_lead_read_notify_farmer_trg ON seller_lead_reads;
CREATE TRIGGER seller_lead_read_notify_farmer_trg
  AFTER INSERT ON seller_lead_reads
  FOR EACH ROW
  EXECUTE FUNCTION public.seller_lead_read_notify_farmer();

COMMIT;
