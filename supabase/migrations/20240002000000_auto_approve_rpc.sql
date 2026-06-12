-- ============================================
-- AUTO-APPROVE RPC
-- Lets a PENDING merchant flip their own status to APPROVED once the
-- 24-hour review window has elapsed. The window must match
-- AUTO_APPROVE_HOURS in src/lib/constants.js.
--
-- SECURITY DEFINER because users_self_update_safe_fields intentionally
-- blocks users from changing their own status — every eligibility
-- check therefore lives inside this function.
-- ============================================

CREATE OR REPLACE FUNCTION auto_approve_self()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  caller public.users%ROWTYPE;
  eligible_at timestamptz;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO caller FROM users WHERE id = uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'user_not_found');
  END IF;

  IF caller.role IS DISTINCT FROM 'MERCHANT' THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'not_merchant');
  END IF;

  IF caller.is_disabled IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'disabled');
  END IF;

  IF caller.status IS DISTINCT FROM 'PENDING' THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'wrong_status');
  END IF;

  -- COALESCE(resubmitted_at, created_at) <= NOW() - INTERVAL '24 hours',
  -- written NULL-safe: a row with neither timestamp is never eligible.
  eligible_at := COALESCE(caller.resubmitted_at, caller.created_at) + INTERVAL '24 hours';
  IF eligible_at IS NULL OR NOW() < eligible_at THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'too_early');
  END IF;

  -- Status re-checked in WHERE so a concurrent admin rejection between
  -- the SELECT above and this UPDATE can never be overwritten.
  UPDATE users
     SET status = 'APPROVED',
         approved_at = NOW()
   WHERE id = uid
     AND status = 'PENDING';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'wrong_status');
  END IF;

  RETURN jsonb_build_object('approved', true);
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default — pull that back
-- so only logged-in users (not anon) can call it.
REVOKE EXECUTE ON FUNCTION auto_approve_self() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auto_approve_self() TO authenticated;

-- Make PostgREST pick up the new RPC without waiting for a restart.
NOTIFY pgrst, 'reload schema';
