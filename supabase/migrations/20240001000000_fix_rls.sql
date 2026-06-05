-- ============================================
-- USERS TABLE
-- Drop the two dangerously open policies only.
-- Leave users_self_update_resubmit untouched — it covers the
-- legitimate resubmit flow (REJECTED → PENDING).
-- ============================================

DROP POLICY IF EXISTS "Anyone can update user record" ON users;
DROP POLICY IF EXISTS "Anyone can delete user record" ON users;

-- Farmers updating their own district after signup.
-- Merchants writing their own pending_rate after signup.
-- Neither can touch role, status, or is_disabled.
CREATE POLICY "users_self_update_safe_fields" ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT u.role FROM users u WHERE u.id = auth.uid())
    AND is_disabled = (SELECT u.is_disabled FROM users u WHERE u.id = auth.uid())
    AND status = (SELECT u.status FROM users u WHERE u.id = auth.uid())
  );

-- Admins can update any user row (approve, reject, disable, re-enable).
-- role is intentionally not writable — no product flow changes it.
CREATE POLICY "users_admin_update" ON users
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
    AND role = (SELECT u.role FROM users u WHERE u.id = id)
  );

-- Only admins can delete user rows.
CREATE POLICY "users_admin_delete" ON users
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

-- ============================================
-- RATES TABLE
-- Scope writes to authenticated approved merchants only,
-- on their own rows only.
-- ============================================

DROP POLICY IF EXISTS "Merchant can insert rates" ON rates;
DROP POLICY IF EXISTS "Merchant can update own rates" ON rates;
DROP POLICY IF EXISTS "Merchant can delete own rates" ON rates;

CREATE POLICY "rates_merchant_insert" ON rates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    merchant_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'MERCHANT'
        AND u.status = 'APPROVED'
        AND u.is_disabled = false
    )
  );

CREATE POLICY "rates_merchant_update" ON rates
  FOR UPDATE
  TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (
    merchant_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'MERCHANT'
        AND u.status = 'APPROVED'
        AND u.is_disabled = false
    )
  );

-- Merchant deletes own rates. Admin can delete any rate.
CREATE POLICY "rates_merchant_delete" ON rates
  FOR DELETE
  TO authenticated
  USING (
    merchant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

-- ============================================
-- REVIEWS TABLE
-- Scope delete to admins only.
-- ============================================

DROP POLICY IF EXISTS "Admin can delete reviews" ON reviews;

CREATE POLICY "reviews_admin_delete" ON reviews
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

-- ============================================
-- LEADS TABLE
-- Scope read to own merchant leads + admins.
-- Anyone can still insert a lead (keep existing policy).
-- ============================================

DROP POLICY IF EXISTS "Public read leads" ON leads;

CREATE POLICY "leads_merchant_read" ON leads
  FOR SELECT
  TO authenticated
  USING (
    merchant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );
