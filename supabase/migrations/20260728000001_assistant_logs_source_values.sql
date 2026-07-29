-- ============================================
-- ASSISTANT LOGS: WIDEN THE source VALUE SET
--
-- Widens assistant_logs_source_chk to admit two new values, nolistings and
-- lookupfail, so that three outcomes previously all logged as "data" can be
-- told apart:
--
--   data        the listings lookup ran, matched rows, and the model phrased
--               an answer grounded in those exact rows.
--   nolistings  the lookup ran and matched nothing. The crop was understood,
--               there is simply no current listing for it.
--   lookupfail  the lookup itself errored, so we never learned whether any
--               listing exists.
--
-- Collapsed into one value these three were indistinguishable in the log, so
-- a reading of "how often does the assistant give a grounded price answer"
-- counted all three as grounded. Only the first is.
--
-- ALREADY APPLIED BY HAND on 28 July 2026 against the production database.
-- This file exists so the repo matches live state, not to introduce a change.
-- The previous migration, 20260725000001_assistant_logs.sql, is left exactly
-- as it is: an applied migration is never edited.
--
-- This file touches one named constraint, assistant_logs_source_chk. It
-- creates and alters no other object, and it reads and writes no rows. The
-- value set is only ever widened here, so no existing row can fail the new
-- constraint.
--
-- The DROP uses IF EXISTS, so running this file against a database where it
-- has already been applied, or where the constraint was dropped by some other
-- route, succeeds rather than erroring. Re-running is safe.
-- ============================================

BEGIN;

ALTER TABLE assistant_logs DROP CONSTRAINT IF EXISTS assistant_logs_source_chk;

ALTER TABLE assistant_logs ADD CONSTRAINT assistant_logs_source_chk CHECK (
  source IN ('smalltalk', 'blocked', 'data', 'nolistings', 'lookupfail',
             'general', 'knowledge', 'outside', 'error')
);

COMMIT;
