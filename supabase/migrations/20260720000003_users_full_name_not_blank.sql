BEGIN;

-- ============================================
-- USERS.full_name: REJECT BLANK NAMES AT THE DATABASE LEVEL (DEFENCE IN DEPTH)
--
-- The app-level fix already shipped closes the whitespace bypass at the
-- signup forms: the fullName zod schema now runs .trim().min(2), so a name
-- of only spaces is rejected before it can be saved. This migration adds
-- the same protection one layer down, at the database, so that no future
-- code path, including ones not yet written, can silently write a blank
-- name into users.full_name.
--
-- The rule: full_name may be NULL, but if it is not NULL it must contain at
-- least one non-whitespace character. NULL stays allowed on purpose. The
-- handle_new_user sign-up trigger (20260613000001) inserts a users row with
-- only id, email, role and status, and full_name is filled in afterward by a
-- separate self-update when the signup form completes. Rows that are still
-- in that intermediate state carry a genuine NULL full_name and must keep
-- working, so this migration deliberately does NOT add NOT NULL.
--
-- Why the NULL rows pass: a CHECK constraint is violated only when its
-- expression evaluates to FALSE. For a NULL full_name the first branch,
-- full_name IS NULL, is TRUE, so the whole OR is TRUE and the row passes.
-- Even without that explicit branch, NULL ~ '...' evaluates to NULL, and a
-- CHECK treats a NULL result as satisfied, never as a violation. Either way
-- the existing NULL rows are safe.
--
-- The regex '[^[:space:]]' matches any single character that is not
-- whitespace (space, tab, newline, carriage return, and so on), so
-- full_name ~ '[^[:space:]]' is TRUE only when the value contains at least
-- one real, non-whitespace character. An empty string or a value made up
-- solely of whitespace fails and is rejected. This mirrors the JavaScript
-- .trim() check now enforced in the forms.
--
-- Re-runnable: the constraint is added only if it does not already exist, so
-- applying this file more than once is a no-op after the first time.
--
-- This file only adds a constraint. It defines no table, column or callable
-- RPC, so there is nothing for PostgREST to pick up and no NOTIFY pgrst.
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_full_name_not_blank') THEN
    ALTER TABLE users ADD CONSTRAINT users_full_name_not_blank
      CHECK (full_name IS NULL OR full_name ~ '[^[:space:]]');
  END IF;
END $$;

COMMIT;
