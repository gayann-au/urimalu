-- ============================================
-- GOOGLE SIGN-UP ONBOARDING
--
-- Until now handle_new_user RAISEd for any sign-up whose metadata carried no
-- FARMER/MERCHANT role. That is correct for email/password sign-up (the client
-- always sends a role) but it blocks Google sign-in: a Google credential
-- arrives with no role, so the auth.users insert rolled back and the whole
-- sign-in failed with "Database error saving new user".
--
-- This migration lets a brand new Google account sign in, then finish setup by
-- choosing Farmer or Merchant on an onboarding screen:
--
--   1) handle_new_user now lets a role-less Google (OAuth) sign-up proceed
--      WITHOUT creating a public.users row. Email sign-ups that are missing a
--      role still fail loudly, exactly as before.
--   2) A new SECURITY DEFINER RPC, complete_google_onboarding(p_role), creates
--      the public.users row for the signed-in user with the role they picked
--      and the status the server decides (FARMER -> ACTIVE, MERCHANT ->
--      PENDING). It allow-lists the role and refuses to run twice, so the
--      client can never choose an arbitrary role/status or overwrite an
--      existing row. This mirrors the security the trigger gives password
--      sign-ups. The client then fills the remaining profile fields with the
--      same self-update it already uses after password sign-up.
-- ============================================


-- ============================================
-- 1) Trigger function: tolerate role-less OAuth sign-ups
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  intended_role   text := new.raw_user_meta_data->>'role';
  signup_provider text := new.raw_app_meta_data->>'provider';
  row_status      text;
BEGIN
  -- Real sign-up roles: create the row exactly as before.
  IF intended_role IN ('FARMER', 'MERCHANT') THEN
    row_status := CASE intended_role
      WHEN 'FARMER'   THEN 'ACTIVE'
      WHEN 'MERCHANT' THEN 'PENDING'
    END;
    INSERT INTO public.users (id, email, role, status)
    VALUES (new.id, new.email, intended_role, row_status);
    RETURN new;
  END IF;

  -- OAuth (Google) sign-ups arrive without a role. Let the auth account be
  -- created with no public.users row yet; complete_google_onboarding writes
  -- that row once the visitor picks Farmer or Merchant on the onboarding
  -- screen. The provider is 'email' for password sign-up and 'google' here.
  IF signup_provider IS NOT NULL AND signup_provider <> 'email' THEN
    RETURN new;
  END IF;

  -- Email sign-up with a missing or invalid role: fail loudly, as before.
  RAISE EXCEPTION 'handle_new_user: invalid or missing role in signup metadata: %', intended_role;
END;
$$;


-- ============================================
-- 2) Onboarding RPC: create the users row for a Google account
--
-- Called by the client only after a Google session exists and the visitor has
-- chosen a role. SECURITY DEFINER so it can write public.users the same way the
-- sign-up trigger does, but every value it trusts from the client (just p_role)
-- is allow-listed, and it refuses to run if a row already exists.
-- ============================================

CREATE OR REPLACE FUNCTION public.complete_google_onboarding(p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid        uuid := auth.uid();
  user_email text;
  row_status text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'complete_google_onboarding: no authenticated user';
  END IF;

  -- Allow-list the role, exactly like the sign-up trigger does.
  IF p_role NOT IN ('FARMER', 'MERCHANT') THEN
    RAISE EXCEPTION 'complete_google_onboarding: invalid role: %', p_role;
  END IF;

  -- One time only: never overwrite or duplicate an existing profile. This is
  -- what stops the RPC being used to flip a role or re-provision a row.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = uid) THEN
    RAISE EXCEPTION 'complete_google_onboarding: profile already exists for %', uid;
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = uid;

  -- status is fixed here by the server, never read from the client.
  row_status := CASE p_role
    WHEN 'FARMER'   THEN 'ACTIVE'
    WHEN 'MERCHANT' THEN 'PENDING'
  END;

  INSERT INTO public.users (id, email, role, status)
  VALUES (uid, user_email, p_role, row_status);
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default; pull that back and grant
-- only to logged-in users. anon must never be able to mint a profile row.
REVOKE EXECUTE ON FUNCTION public.complete_google_onboarding(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_google_onboarding(text) TO authenticated;

-- Make PostgREST pick up the new function without a restart.
NOTIFY pgrst, 'reload schema';
