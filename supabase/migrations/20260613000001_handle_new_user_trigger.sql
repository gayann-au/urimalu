-- ============================================
-- USER CREATION MOVES TO A DATABASE TRIGGER
--
-- Until now the browser created the public.users row itself, right after
-- sign-up, with a client-side insert. That meant the client chose the id,
-- role and status — values a malicious caller could tamper with.
--
-- This migration moves row creation into the database so it happens
-- automatically and safely whenever a new auth account is created:
--
--   * A trigger fires AFTER INSERT on auth.users (i.e. on every sign-up).
--   * It reads the role the client asked for from the sign-up metadata
--     (raw_user_meta_data->>'role') and ONLY accepts 'FARMER' or 'MERCHANT'.
--     Anything else (including a missing role) raises an error, so a bad
--     sign-up fails loudly instead of creating a junk row.
--   * status is decided here in the trigger, never taken from the client:
--     FARMER -> 'ACTIVE', MERCHANT -> 'PENDING'.
--   * The trigger inserts only four columns: id, email, role, status.
--     The browser fills in the remaining profile fields afterwards with a
--     normal self-update (which cannot change role/status/is_disabled).
--
-- The function is SECURITY DEFINER with a pinned search_path so it can write
-- to public.users regardless of the caller's row-level-security context.
-- ============================================


-- ============================================
-- 1) Trigger function: create the users row on sign-up
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  intended_role text := new.raw_user_meta_data->>'role';
  row_status    text;
BEGIN
  -- Allow-list the client-supplied role. Reject null or anything that is
  -- not one of the two real sign-up roles, so the sign-up fails loudly.
  IF intended_role IS NULL OR intended_role NOT IN ('FARMER', 'MERCHANT') THEN
    RAISE EXCEPTION 'handle_new_user: invalid or missing role in signup metadata: %', intended_role;
  END IF;

  -- status is fixed here by the trigger, never read from metadata.
  row_status := CASE intended_role
    WHEN 'FARMER'   THEN 'ACTIVE'
    WHEN 'MERCHANT' THEN 'PENDING'
  END;

  -- Only these four columns; the client fills the rest via self-update.
  INSERT INTO public.users (id, email, role, status)
  VALUES (new.id, new.email, intended_role, row_status);

  RETURN new;
END;
$$;


-- ============================================
-- 2) Trigger on auth.users (idempotent: drop then create)
-- ============================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ============================================
-- DEFERRED LOCKDOWN — intentionally NOT done in this migration.
--
-- The client-side insert is now redundant, but tightening the table is left
-- to a SEPARATE follow-up migration that runs only AFTER trigger-based
-- sign-up has been tested end to end. That follow-up — NOT this file — will:
--   * drop the "Anyone can insert user" INSERT policy on public.users, and
--   * revoke any INSERT grant that let the client create its own row.
-- Nothing in this migration drops a policy or revokes a grant.
-- ============================================
