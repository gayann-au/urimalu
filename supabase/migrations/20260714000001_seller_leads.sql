BEGIN;

-- ============================================
-- SELLER LEADS ("Ready to Sell")
--
-- A farmer posts a short notice that they are ready to sell. Every merchant
-- who has posted at least one price (a row in price_history) is notified,
-- in-app and via push, through the same notifications table and send-push
-- Edge Function already used for price alerts.
--
-- farmer_name and farmer_phone are a snapshot of the farmer's profile at
-- post time, written by the BEFORE INSERT trigger below from the users
-- table, never taken from the client. This is the same raw-facts-not-a-join
-- approach the price alert trigger uses for merchant_name: it lets a
-- merchant's lead card render the farmer's name and call/WhatsApp number
-- without needing a SELECT policy that would expose the wider users table
-- (the users RLS only lets a merchant read approved-merchant rows, never a
-- farmer's row) and without ever trusting a client-supplied name or phone
-- for what is a read-only field in the UI.
-- ============================================

CREATE TABLE IF NOT EXISTS seller_leads (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farmer_name   text        NOT NULL,
  farmer_phone  text        NOT NULL,
  description   text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  is_deleted    boolean     NOT NULL DEFAULT false,

  CONSTRAINT seller_leads_description_len CHECK (char_length(description) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS seller_leads_farmer_id_idx ON seller_leads (farmer_id);
CREATE INDEX IF NOT EXISTS seller_leads_active_created_idx ON seller_leads (created_at DESC) WHERE is_deleted = false;

ALTER TABLE seller_leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON seller_leads FROM anon;
REVOKE ALL ON seller_leads FROM authenticated;

-- Farmers read their own rows (active or deleted); merchants read every
-- active row. Two permissive SELECT policies combine with OR.
CREATE POLICY "seller_leads_select_own" ON seller_leads
  FOR SELECT
  TO authenticated
  USING (farmer_id = auth.uid());

CREATE POLICY "seller_leads_select_active_for_merchants" ON seller_leads
  FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'MERCHANT')
  );

-- A farmer inserts only their own row. farmer_name/farmer_phone are set by
-- the trigger below, not accepted from the client (see column grant).
CREATE POLICY "seller_leads_insert_own" ON seller_leads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    farmer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'FARMER')
  );

-- Soft delete only: a farmer may flip is_deleted on their own row, nothing else.
CREATE POLICY "seller_leads_update_own" ON seller_leads
  FOR UPDATE
  TO authenticated
  USING (farmer_id = auth.uid())
  WITH CHECK (farmer_id = auth.uid());

GRANT SELECT ON seller_leads TO authenticated;
GRANT INSERT (farmer_id, description) ON seller_leads TO authenticated;
GRANT UPDATE (is_deleted) ON seller_leads TO authenticated;

-- ============================================
-- TRIGGER: enforce the 5-active-leads limit and stamp the farmer snapshot
--
-- Runs as the inserting farmer (no SECURITY DEFINER needed): a farmer can
-- already read their own users row and their own seller_leads rows under
-- the policies above, which is all this trigger looks at.
-- ============================================

CREATE OR REPLACE FUNCTION public.seller_leads_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  active_count integer;
BEGIN
  SELECT count(*) INTO active_count
  FROM public.seller_leads
  WHERE farmer_id = NEW.farmer_id AND is_deleted = false;

  IF active_count >= 5 THEN
    RAISE EXCEPTION 'A farmer may have at most 5 active seller leads at a time'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT u.full_name, u.phone INTO NEW.farmer_name, NEW.farmer_phone
  FROM public.users u
  WHERE u.id = NEW.farmer_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seller_leads_before_insert_trg ON seller_leads;
CREATE TRIGGER seller_leads_before_insert_trg
  BEFORE INSERT ON seller_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.seller_leads_before_insert();


-- ============================================
-- SELLER LEAD READS
--
-- One row per merchant per lead, inserted the first time that merchant
-- views the lead. Existence of a row is the unread/read signal; there is
-- nothing to update afterwards, so no UPDATE policy is needed.
-- ============================================

CREATE TABLE IF NOT EXISTS seller_lead_reads (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_lead_id  uuid        NOT NULL REFERENCES seller_leads(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT seller_lead_reads_one_per_merchant UNIQUE (merchant_id, seller_lead_id)
);

CREATE INDEX IF NOT EXISTS seller_lead_reads_merchant_idx ON seller_lead_reads (merchant_id);
CREATE INDEX IF NOT EXISTS seller_lead_reads_lead_idx ON seller_lead_reads (seller_lead_id);

ALTER TABLE seller_lead_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON seller_lead_reads FROM anon;
REVOKE ALL ON seller_lead_reads FROM authenticated;

CREATE POLICY "seller_lead_reads_select_own" ON seller_lead_reads
  FOR SELECT
  TO authenticated
  USING (merchant_id = auth.uid());

CREATE POLICY "seller_lead_reads_insert_own" ON seller_lead_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    merchant_id = auth.uid()
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'MERCHANT')
  );

GRANT SELECT ON seller_lead_reads TO authenticated;
GRANT INSERT (merchant_id, seller_lead_id) ON seller_lead_reads TO authenticated;


-- ============================================
-- NOTIFICATIONS: extend for the seller_lead type
--
-- notifications was built for one shape (a price alert: crop_name +
-- old_price + new_price + merchant_name). A seller lead notification carries
-- different raw facts (farmer_name + seller_lead_id), so crop_name can no
-- longer be NOT NULL for every row; a type column plus a matching CHECK
-- keeps each row internally consistent for whichever kind it is.
-- ============================================

ALTER TABLE notifications ALTER COLUMN crop_name DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'price_alert';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS farmer_name text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS seller_lead_id uuid REFERENCES seller_leads(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_chk;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_chk
  CHECK (type IN ('price_alert', 'seller_lead'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_fields_chk;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_fields_chk
  CHECK (
    (type = 'price_alert' AND crop_name IS NOT NULL)
    OR
    (type = 'seller_lead' AND farmer_name IS NOT NULL AND seller_lead_id IS NOT NULL)
  );


-- ============================================
-- TRIGGER: fan a seller_leads insert out to every merchant who has ever
-- posted a price.
--
-- SECURITY DEFINER, same pattern and same scope reasoning as
-- price_history_notify_followers: it reads merchant_id values out of
-- price_history (a publicly readable table anyway) and inserts notifications
-- rows, nothing else. EXECUTE is revoked from every client role, and a
-- trigger function returning trigger cannot be called through the API, so
-- this grants no general RLS bypass to anyone.
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
  FROM public.price_history ph;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seller_lead_notify_merchants() FROM PUBLIC;

DROP TRIGGER IF EXISTS seller_lead_notify_merchants_trg ON seller_leads;
CREATE TRIGGER seller_lead_notify_merchants_trg
  AFTER INSERT ON seller_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.seller_lead_notify_merchants();

-- Make PostgREST pick up the new tables and columns without a restart.
NOTIFY pgrst, 'reload schema';

COMMIT;
