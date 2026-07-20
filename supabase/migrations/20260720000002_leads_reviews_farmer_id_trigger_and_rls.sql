BEGIN;

-- ============================================
-- LEADS AND REVIEWS: STAMP farmer_id SERVER SIDE, CLOSE THE PUBLIC
-- WRITE PATH, AND SCOPE THE PUBLIC REVIEW READ
--
-- Two gaps existed on leads and reviews, both confirmed against the live
-- database:
--
--   1. An unauthenticated public WRITE path. Both tables carried an INSERT
--      policy open to role public with no login required and no restriction
--      on the row written ("Anyone can insert lead" on leads and "Anyone can
--      insert review" on reviews, both with_check true). On both tables
--      farmer_id is a plain uuid set directly from whatever the client sent,
--      with nothing stamping it server side, so any caller could write a row
--      and attribute it to any farmer_id they chose.
--
--   2. An unrestricted public READ path on reviews. "Public read reviews" was
--      open to role public with qual true, so every review row was readable
--      off the REST endpoint regardless of the reviewed merchant's standing.
--
-- This migration closes both.
--
-- The trigger below stamps NEW.farmer_id = auth.uid() unconditionally on
-- insert, overriding any client supplied value, so a row can only ever be
-- attributed to the caller who wrote it. This is the same identity spoofing
-- fix already applied once to seller_leads: seller_leads_before_insert in
-- 20260714000001 writes the farmer snapshot from the users table rather than
-- trusting the client, and the seller_leads_insert_own policy pins
-- farmer_id = auth.uid(). Here farmer_id is the value being spoofed, so the
-- trigger sets it directly. leads and reviews share the same farmer_id column
-- name for this purpose, so one function serves both tables.
--
-- The replacement INSERT policies are scoped TO authenticated with
-- WITH CHECK (farmer_id = auth.uid()). That check is redundant with the
-- trigger for a legitimate request (the trigger has already forced farmer_id
-- to auth.uid() before the check runs), but it is kept as defence in depth:
-- the policy states the invariant even if the trigger is ever dropped or
-- disabled.
--
-- The replacement reviews SELECT policy keeps role public (no TO clause), to
-- match how listings_public_read and price_history_public_read are scoped in
-- 20260717000006. It applies the same approved, non disabled merchant gate
-- used by users_read_approved_merchants in 20260612000001, written as a
-- correlated EXISTS against the row's own merchant_id, and additionally lets
-- a farmer always read their own review and lets an admin read everything.
-- auth.uid() resolves to NULL for anon, so the farmer and admin branches are
-- simply false for an anonymous caller and only the approved merchant gate
-- applies to them.
--
-- Not touched, deliberately: merchant_id, type, author_name, rating, comment,
-- flagged and created_at columns, and the existing leads_merchant_read
-- (20240001000000) and reviews_admin_delete (20240001000000) policies, which
-- are correct as is.
--
-- No NOTIFY pgrst here: this file adds no table, column or callable RPC. A
-- trigger function returning trigger cannot be called through the REST API,
-- and RLS policies are evaluated by Postgres per query rather than cached in
-- PostgREST's schema, so there is nothing for it to pick up.
-- ============================================


-- ============================================
-- TRIGGER FUNCTION: stamp farmer_id from the authenticated caller
--
-- SECURITY INVOKER: it reads only auth.uid() and mutates the incoming row,
-- so it needs no elevated privilege.
-- ============================================

CREATE OR REPLACE FUNCTION public.stamp_farmer_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.farmer_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_stamp_farmer_id_trg ON leads;
CREATE TRIGGER leads_stamp_farmer_id_trg
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_farmer_id();

DROP TRIGGER IF EXISTS reviews_stamp_farmer_id_trg ON reviews;
CREATE TRIGGER reviews_stamp_farmer_id_trg
  BEFORE INSERT ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_farmer_id();


-- ============================================
-- LEADS: replace the open public insert with an authenticated, own-row insert
-- ============================================

DROP POLICY IF EXISTS "Anyone can insert lead" ON leads;

CREATE POLICY "leads_insert_authenticated" ON leads
  FOR INSERT
  TO authenticated
  WITH CHECK (farmer_id = auth.uid());


-- ============================================
-- REVIEWS: replace the open public insert with an authenticated, own-row insert
-- ============================================

DROP POLICY IF EXISTS "Anyone can insert review" ON reviews;

CREATE POLICY "reviews_insert_authenticated" ON reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (farmer_id = auth.uid());


-- ============================================
-- REVIEWS: replace the unrestricted public read with the approved-merchant
-- gate, plus own-review and admin reads
-- ============================================

DROP POLICY IF EXISTS "Public read reviews" ON reviews;

CREATE POLICY "reviews_public_read" ON reviews
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = reviews.merchant_id
        AND u.role = 'MERCHANT'
        AND u.status = 'APPROVED'
        AND u.is_disabled = false
    )
    OR farmer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

COMMIT;
