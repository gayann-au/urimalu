BEGIN;

-- ============================================
-- MERCHANT APPROVED / REJECTED NOTIFICATIONS
--
-- The trigger lives on public.users itself, NOT in the admin panel code, and
-- fires for any UPDATE that changes status, whoever performs it. That is the
-- point: there are two approval paths in this app and only a table level
-- trigger catches both.
--
--   1) The admin panel: a direct client UPDATE on users
--      (useSetMerchantStatus in src/features/admin/useAdmin.js).
--   2) auto_approve_self(), the SECURITY DEFINER RPC from 20240002000000,
--      which flips PENDING to APPROVED after 24 hours with no admin involved.
--
-- A trigger hung off the admin action would silently miss every merchant who
-- was auto approved, which is most of them.
--
-- The WHEN clause does the gating the specification asks for: status actually
-- changed, and the row is a merchant. Farmers (status ACTIVE) never match.
-- INSERTs are not covered, so a new merchant landing on PENDING is not
-- notified about their own signup.
--
-- SECURITY DEFINER with a pinned search_path, EXECUTE revoked from PUBLIC,
-- same pattern and same scope reasoning as seller_lead_notify_merchants: it
-- reads nothing beyond the row already being updated and inserts one
-- notifications row. A trigger function returning trigger cannot be called
-- through the API, so this grants no general RLS bypass to anyone.
-- ============================================

CREATE OR REPLACE FUNCTION public.users_status_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'APPROVED' THEN
    INSERT INTO public.notifications (user_id, type)
    VALUES (NEW.id, 'merchant_approved');

  -- rejection_reason is guarded, not assumed. notifications_type_fields_chk
  -- requires message IS NOT NULL for merchant_rejected, and this is an AFTER
  -- trigger inside the caller's transaction: a null reason would violate the
  -- constraint and roll back the admin's rejection itself. The admin panel
  -- enforces a non empty reason in JavaScript only (useAdmin.js), which is not
  -- a guarantee at the database level. Skipping the notification is the safe
  -- failure here; blocking a rejection is not.
  ELSIF NEW.status = 'REJECTED' AND NEW.rejection_reason IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, message)
    VALUES (NEW.id, 'merchant_rejected', NEW.rejection_reason);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.users_status_notify() FROM PUBLIC;

DROP TRIGGER IF EXISTS users_status_notify_trg ON users;
CREATE TRIGGER users_status_notify_trg
  AFTER UPDATE ON users
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.role = 'MERCHANT')
  EXECUTE FUNCTION public.users_status_notify();

COMMIT;
