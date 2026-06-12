-- ============================================
-- Drop old rates table (and its RLS policies).
-- No other table has a FK pointing at rates.
-- ============================================

DROP TABLE IF EXISTS rates CASCADE;


-- ============================================
-- TABLE: listings
-- One row per crop a merchant is willing to buy.
-- price is NULL when call_for_price is true.
-- price_per_kg is a generated column for sorting
-- and cross-unit comparison.
-- ============================================

CREATE TABLE listings (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name       text          NOT NULL,
  variety_notes   text,
  price           numeric,
  unit_label      text          NOT NULL,
  unit_kg         numeric       NOT NULL,
  price_per_kg    numeric       GENERATED ALWAYS AS (price / NULLIF(unit_kg, 0)) STORED,
  call_for_price  boolean       NOT NULL DEFAULT false,
  is_active       boolean       NOT NULL DEFAULT true,
  notes           text,
  valid_till      date,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX listings_merchant_id_idx ON listings (merchant_id);
CREATE INDEX listings_crop_name_idx   ON listings (crop_name);

-- Enable RLS
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Public read (logged-out farmers can browse the feed)
CREATE POLICY "listings_public_read" ON listings
  FOR SELECT
  USING (true);

-- Merchant inserts their own listings
CREATE POLICY "listings_merchant_insert" ON listings
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

-- Merchant updates their own listings
CREATE POLICY "listings_merchant_update" ON listings
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

-- Merchant deletes own listings. Admin can delete any.
CREATE POLICY "listings_merchant_delete" ON listings
  FOR DELETE
  TO authenticated
  USING (
    merchant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

-- Admin full access (covers approve/reject flows that may need to write)
CREATE POLICY "listings_admin_all" ON listings
  FOR ALL
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
  );


-- ============================================
-- TABLE: price_history
-- Append-only log. One row per price snapshot
-- (written whenever a merchant saves a listing).
-- Drives the 7-day chart on the merchant profile.
-- ============================================

CREATE TABLE price_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    uuid        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  merchant_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name     text        NOT NULL,
  price         numeric,
  price_per_kg  numeric,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX price_history_merchant_crop_time_idx
  ON price_history (merchant_id, crop_name, recorded_at);

-- Enable RLS
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "price_history_public_read" ON price_history
  FOR SELECT
  USING (true);

-- Merchant inserts their own history rows
CREATE POLICY "price_history_merchant_insert" ON price_history
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

-- No UPDATE policy on price_history (append-only by design).

-- Admin can delete history rows (e.g. remove bad data)
CREATE POLICY "price_history_admin_delete" ON price_history
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );
