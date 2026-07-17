BEGIN;

-- ============================================
-- NOTIFICATIONS: FOUR NEW TYPES AND A MESSAGE COLUMN
--
-- notifications carried two shapes (price_alert, seller_lead). This adds the
-- four types the merchant lifecycle and reminder features need, plus one
-- nullable free text column for copy that cannot be reconstructed client side
-- from structured facts (today: a rejection reason).
--
-- Both CHECK constraints have to change together. notifications_type_fields_chk
-- is an OR of positive cases with no ELSE branch, so a row carrying a type that
-- no branch names fails the constraint and the insert is rejected. Adding a
-- value to notifications_type_chk alone would not be enough.
--
-- message is deliberately NOT rendered into push copy (see send-push): a
-- rejection reason stays in app, where it is read by the merchant it concerns.
--
-- No new grant is needed. notifications was granted table wide SELECT to
-- authenticated (20260707000001), not a column list, so message is readable by
-- the owning user automatically. UPDATE stays restricted to read_at.
-- ============================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message text;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_chk;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_chk
  CHECK (type IN (
    'price_alert',
    'seller_lead',
    'seller_lead_response',
    'merchant_approved',
    'merchant_rejected',
    'price_reminder'
  ));

-- Per type required fields. Existing rows are price_alert or seller_lead and
-- already satisfy their branches, so this validates without a rewrite.
--
-- seller_lead_response requires seller_lead_id but NOT merchant_name: a
-- merchant's business_name is nullable, and the price_alert path already
-- stores a null merchant_name when it is unset. Requiring it here would make
-- the trigger insert fail for a merchant with no business_name, which would
-- roll back the merchant's seller_lead_reads insert and leave them unable to
-- open a lead at all.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_fields_chk;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_fields_chk
  CHECK (
    (type = 'price_alert'          AND crop_name IS NOT NULL)
    OR
    (type = 'seller_lead'          AND farmer_name IS NOT NULL AND seller_lead_id IS NOT NULL)
    OR
    (type = 'seller_lead_response' AND seller_lead_id IS NOT NULL)
    OR
    (type = 'merchant_approved')
    OR
    (type = 'merchant_rejected'    AND message IS NOT NULL)
    OR
    (type = 'price_reminder')
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
