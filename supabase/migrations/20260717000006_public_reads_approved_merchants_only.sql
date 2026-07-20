BEGIN;

-- ============================================
-- LISTINGS AND PRICE HISTORY: PUBLIC READS SCOPED TO APPROVED,
-- NON-DISABLED MERCHANTS
--
-- listings_public_read and price_history_public_read (20260605000001) were
-- both USING (true) with no TO clause, so every row of both tables was
-- readable by anon and authenticated alike, whatever the owning merchant's
-- standing. The app never showed those rows (useFeed filters client side to
-- active listings from approved merchants), but that filter only ever existed
-- in the client: a PENDING, REJECTED or disabled merchant's prices stayed
-- readable straight off the REST endpoint. Disabling a merchant is the remedy
-- for abuse, and it hid them from the UI without taking their data off the API.
--
-- This migration moves the filter into the policies, using the standing gate
-- the rest of the schema already applies: see seller_lead_notify_merchants in
-- 20260716000001, seller_leads_select_active_for_merchants in 20260717000005,
-- and users_read_approved_merchants in 20260612000001.
--
-- 20260716000001 writes that gate as a JOIN because it filters a set inside a
-- function body. A policy expression is evaluated per candidate row, so the
-- same gate is written here as a correlated EXISTS against the row's own
-- merchant_id. The test is identical.
--
-- role = 'MERCHANT' is deliberately not added, for the reason 20260716000001
-- gives: status 'APPROVED' is only ever set on merchant rows (handle_new_user
-- gives farmers 'ACTIVE'), and both merchant_id columns are FKs to users
-- written only by the merchant insert policies, so the row's owner is a
-- merchant by construction.
--
-- Three companion SELECT policies are added, because tightening the public
-- policies alone would take reads away from people who must keep them.
-- listings_public_read and price_history_public_read are today the ONLY SELECT
-- policies covering a merchant reading their own rows, and
-- price_history_public_read is also the only one covering an admin
-- (price_history_admin_delete is DELETE only). Narrowing them on their own
-- would empty a disabled merchant's own dashboard and price history, and would
-- cut admins off from any non-approved merchant's history. Permissive policies
-- OR together, so:
--
--   listings_merchant_read_own       a merchant always reads their own
--                                    listings, whatever their standing
--   price_history_merchant_read_own  the same for their own history
--   price_history_admin_read         restores the admin read that
--                                    USING (true) was quietly providing
--
-- listings needs no admin companion: listings_admin_all (20260605000001) is
-- FOR ALL and already covers admin SELECT.
--
-- The admin companion is a separate policy scoped TO authenticated rather than
-- an OR inside price_history_public_read, and this matters. is_admin() has
-- EXECUTE revoked from PUBLIC and granted only to authenticated
-- (20260612000001), so calling it from a policy that anon also evaluates would
-- fail the whole public feed with a permission error, and OR is not guaranteed
-- to short circuit. An authenticated-only policy keeps anon well clear of it.
--
-- The EXISTS resolves for anon: users_read_approved_merchants (20260612000001)
-- is TO anon, authenticated and exposes exactly the approved, non-disabled
-- merchant rows this test looks for, and status and is_disabled are both in the
-- SELECT column grant that migration gives anon. The authenticated-only users
-- policies, including the one that calls is_admin(), are never evaluated for
-- anon.
--
-- is_disabled is tested with IS NOT TRUE rather than = false so a NULL can
-- never read as enabled.
--
-- Scope: five SELECT policies across two tables. No table, column, grant,
-- trigger or function is touched, and the insert, update and delete policies on
-- both tables keep their existing standing checks. is_active is deliberately
-- not filtered here: it stays a client concern, and the merchant dashboard has
-- to read its own inactive rows.
--
-- No NOTIFY pgrst here: this file adds no table, column or callable RPC, and
-- RLS policies are evaluated by Postgres per query rather than cached in
-- PostgREST's schema, so there is nothing for it to pick up.
-- ============================================


-- ============================================
-- LISTINGS
-- ============================================

DROP POLICY IF EXISTS "listings_public_read" ON listings;

CREATE POLICY "listings_public_read" ON listings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = listings.merchant_id
        AND u.status = 'APPROVED'
        AND u.is_disabled IS NOT TRUE
    )
  );

DROP POLICY IF EXISTS "listings_merchant_read_own" ON listings;

CREATE POLICY "listings_merchant_read_own" ON listings
  FOR SELECT
  TO authenticated
  USING (merchant_id = auth.uid());


-- ============================================
-- PRICE HISTORY
-- ============================================

DROP POLICY IF EXISTS "price_history_public_read" ON price_history;

CREATE POLICY "price_history_public_read" ON price_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = price_history.merchant_id
        AND u.status = 'APPROVED'
        AND u.is_disabled IS NOT TRUE
    )
  );

DROP POLICY IF EXISTS "price_history_merchant_read_own" ON price_history;

CREATE POLICY "price_history_merchant_read_own" ON price_history
  FOR SELECT
  TO authenticated
  USING (merchant_id = auth.uid());

DROP POLICY IF EXISTS "price_history_admin_read" ON price_history;

CREATE POLICY "price_history_admin_read" ON price_history
  FOR SELECT
  TO authenticated
  USING (is_admin());

COMMIT;
