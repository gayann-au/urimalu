BEGIN;

-- ============================================
-- SELLER LEADS: MERCHANT READS SCOPED TO APPROVED, NON-DISABLED MERCHANTS
--
-- seller_leads_select_active_for_merchants (20260714000001) let any row in
-- users with role = 'MERCHANT' read every active seller lead, with no check on
-- that merchant's current standing. seller_leads stores farmer_name and
-- farmer_phone as a snapshot taken at post time, so the policy handed a
-- farmer's name and phone number to three groups that should never have had
-- them: a merchant still PENDING review, a merchant already REJECTED, and a
-- merchant an admin had disabled from the reports screen. The last of those is
-- the worst, because disabling a merchant is the remedy for abuse and it did
-- not revoke this read.
--
-- This migration replaces the policy with the same standing gate the rest of
-- the schema already uses: see seller_lead_notify_merchants in 20260716000001,
-- listings_merchant_insert and price_history_merchant_insert in 20260605000001,
-- and users_read_approved_merchants in 20260612000001. 20260716000001 closed
-- this same hole on the notification fan-out; a merchant who stopped being
-- notified there could still read the table directly through PostgREST, which
-- is what this file closes.
--
-- role = 'MERCHANT' is kept in the filter even though 20260716000001 reasons
-- it is redundant (status 'APPROVED' is only ever set on merchant rows, since
-- handle_new_user gives farmers 'ACTIVE'). Keeping it makes this policy an
-- addition to the old test rather than a swap, so the only behaviour that
-- changes here is the loss of unapproved and disabled access.
--
-- The EXISTS subquery reads users as the caller, under RLS, exactly as the
-- policy it replaces already did for u.role. It resolves because
-- users_read_own_row (20260612000001) makes the caller's own row visible, and
-- because status and is_disabled are both in the SELECT column grant that
-- migration gives to authenticated. is_disabled is tested with IS NOT TRUE
-- rather than = false so a NULL can never read as disabled.
--
-- Scope: this one SELECT policy is all that changes. seller_leads_select_own
-- is deliberately untouched, so a farmer keeps reading their own leads whatever
-- their role or standing. The insert and update policies, the column grants,
-- seller_leads_before_insert, the notify trigger, and seller_lead_reads are all
-- left alone.
--
-- No NOTIFY pgrst here: this file adds no table, column or callable RPC, and
-- RLS policies are evaluated by Postgres per query rather than cached in
-- PostgREST's schema, so there is nothing for it to pick up.
-- ============================================

DROP POLICY IF EXISTS "seller_leads_select_active_for_merchants" ON seller_leads;

CREATE POLICY "seller_leads_select_active_for_merchants" ON seller_leads
  FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'MERCHANT'
        AND u.status = 'APPROVED'
        AND u.is_disabled IS NOT TRUE
    )
  );

COMMIT;
