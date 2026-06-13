-- ============================================
-- USERS READ LOCKDOWN
-- Replaces the wide-open "Public read users" SELECT policy (USING (true)),
-- which let anonymous clients download every row and every column of users
-- (farmer phone numbers included) through the REST API.
--
-- Two layers replace it:
--
--   Row policies (which ROWS are visible):
--     - anon + authenticated: approved, non-disabled merchants only
--     - authenticated:        additionally their own row
--     - authenticated admins: every row, via is_admin()
--
--   Column grants (which COLUMNS are visible):
--     - anon:          id, role, status, is_disabled, business_name, town,
--                      district, created_at — never phone, whatsapp, email
--     - authenticated: the anon set plus phone, whatsapp, email and the
--                      fields the app shows on own-profile and admin screens
--     - service_role:  untouched, keeps full table access
--
-- is_admin() is SECURITY DEFINER so the admin SELECT policy does not query
-- users under RLS — an inline EXISTS subquery inside a users SELECT policy
-- would re-trigger the users SELECT policies and recurse. The existing
-- UPDATE/DELETE policies keep their inline subqueries: those now resolve
-- through the new SELECT policies (own row / admin-all) without recursion.
--
-- After this migration, anon and authenticated can no longer use
-- select("*") on users: PostgREST refuses the wildcard when the role lacks
-- SELECT on any column. Every client read of users must list its columns
-- explicitly (see USER_COLUMNS_* in src/lib/constants.js). Columns added to
-- users in the future stay invisible to both roles until granted here.
-- ============================================


-- ============================================
-- 1) Admin helper for SELECT policies
-- ============================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
      AND u.role = 'ADMIN'
  );
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default — pull that back.
-- Only the authenticated SELECT policy below calls it.
REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;


-- ============================================
-- 2) Row policies
-- ============================================

DROP POLICY IF EXISTS "Public read users" ON users;

-- The public feed: anyone (logged in or out) may see merchants that are
-- approved and not disabled. Which of their columns are visible is decided
-- by the per-role column grants below, not here.
DROP POLICY IF EXISTS "users_read_approved_merchants" ON users;
CREATE POLICY "users_read_approved_merchants" ON users
  FOR SELECT
  TO anon, authenticated
  USING (
    role = 'MERCHANT'
    AND status = 'APPROVED'
    AND is_disabled = false
  );

-- Own profile (any role, any status — pending/rejected merchants must still
-- load their own row for the pending page and resubmit flow).
DROP POLICY IF EXISTS "users_read_own_row" ON users;
CREATE POLICY "users_read_own_row" ON users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admin screens list every merchant and farmer.
DROP POLICY IF EXISTS "users_admin_read_all" ON users;
CREATE POLICY "users_admin_read_all" ON users
  FOR SELECT
  TO authenticated
  USING (is_admin());


-- ============================================
-- 3) Column grants
-- Supabase's default GRANT gave anon and authenticated SELECT on the whole
-- table; revoke that and re-grant per column. Only SELECT is touched —
-- INSERT/UPDATE/DELETE privileges and their policies are unchanged, and
-- SECURITY DEFINER functions (auto_approve_self) are unaffected.
-- ============================================

REVOKE SELECT ON users FROM anon;
REVOKE SELECT ON users FROM authenticated;

GRANT SELECT (
  id, role, status, is_disabled,
  business_name, town, district, created_at
) ON users TO anon;

-- The anon set, plus contact fields (the product gates these behind login),
-- plus what own-profile, pending/resubmit, and admin screens render.
-- Intentionally not granted: approved_at and updated_at — flows write them
-- but no screen reads them.
GRANT SELECT (
  id, role, status, is_disabled,
  business_name, town, district, created_at,
  phone, whatsapp, email,
  full_name, owner_name, years_trading, business_type, crops_traded,
  business_description, rejection_reason, resubmitted_at
) ON users TO authenticated;

-- Make PostgREST pick up the new policies and grants without a restart.
NOTIFY pgrst, 'reload schema';
