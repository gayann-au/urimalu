-- ============================================
-- TABLE: listings, COLUMN: confirmed_at
--
-- This column was originally created directly on the live database and
-- was never captured in a migration file. This migration brings the
-- migration history in line with what is already running in production.
--
-- It is written to be safe in both directions:
--   Live database, where the column already exists: the IF NOT EXISTS
--   guard makes this a true no-op, nothing is altered.
--   Fresh database rebuilt from scratch: this creates the column with
--   the exact definition confirmed against the live schema via
--   information_schema.columns.
--
-- Definition (verified live): timestamp with time zone, NOT NULL,
-- DEFAULT now().
--
-- This migration does not change any existing data. On the live
-- database it is skipped entirely; on a fresh rebuild the DEFAULT
-- backfills any rows present when the column is added.
-- ============================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz NOT NULL DEFAULT now();
