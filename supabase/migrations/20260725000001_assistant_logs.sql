BEGIN;

-- ============================================
-- ASSISTANT LOGS
--
-- One row per question put to the AI assistant Edge Function. The assistant
-- currently answers and forgets, so nothing is recorded about what people ask,
-- which path answered them, or where it fails. This table is the only source
-- of that information ahead of the launch to roughly 50 users.
--
-- Every column except id and created_at is written by the Edge Function. The
-- nullable ones are nullable for a reason: reply is empty when the request
-- failed before an answer existed, and model and tokens_used are empty on the
-- smalltalk and blocked paths, which return a canned reply and never reach the
-- model provider at all.
--
-- user_id is nullable with ON DELETE SET NULL rather than CASCADE, the same
-- treatment feature_requests.user_id gets in 20260703000001. A deleted account
-- takes its identity out of the row but leaves the question behind, so the
-- record of what was asked survives the account that asked it.
--
-- source records which path produced the answer. The allowed values are the
-- union of what the function emits today (ReplySource in
-- supabase/functions/assistant/types.ts: smalltalk, blocked, data, general,
-- error) and two values reserved for paths not yet written (knowledge,
-- outside). Writing the union now means the taxonomy can be changed in the
-- function later without a second migration and without an insert ever failing
-- this constraint in the meantime. role is left as plain text with no CHECK,
-- matching how feature_requests.role is declared in 20260703000001.
--
-- SECURITY, the point of this table's design:
--
-- RLS is enabled and NO policies are created. That is the access control, not
-- an oversight. With RLS enabled and no policy present, Postgres denies every
-- row to any role that is neither the table owner nor holds BYPASSRLS, so a
-- browser client using the anon or the authenticated key can neither read nor
-- write here, and there is no policy sitting on the table that could later be
-- widened by accident. The service role key used by the Edge Function holds
-- BYPASSRLS, so the function can still insert. Reads are done from the
-- Supabase dashboard, which connects as the owner.
--
-- This table stores other people's questions verbatim. No policy granting
-- authenticated a SELECT on it should ever be added.
--
-- This file creates one table and one index and touches no existing table.
-- ============================================

CREATE TABLE IF NOT EXISTS assistant_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable on purpose: the question outlives the account that asked it.
  user_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  role        text        NOT NULL,
  message     text        NOT NULL,
  -- NULL when the request failed before any answer was produced.
  reply       text,
  source      text        NOT NULL,
  -- model and tokens_used stay NULL on the paths that never call the provider.
  model       text,
  tokens_used integer,
  ok          boolean     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT assistant_logs_source_chk CHECK (
    source IN ('smalltalk', 'blocked', 'data', 'general', 'knowledge', 'outside', 'error')
  )
);

-- The only read pattern is "show me the most recent questions", so the index
-- is ordered the way that query reads it.
CREATE INDEX IF NOT EXISTS assistant_logs_created_at_idx ON assistant_logs (created_at DESC);

ALTER TABLE assistant_logs ENABLE ROW LEVEL SECURITY;

-- No CREATE POLICY statements follow, deliberately. See the SECURITY note above.

-- Defence in depth beyond RLS, following the REVOKE already used on
-- feature_requests (20260703000001) and push_subscriptions (20260708000001).
-- Neither browser role has any legitimate use for this table, so the table
-- privilege is pulled as well as row access. service_role is untouched and
-- keeps full access.
REVOKE ALL ON assistant_logs FROM anon;
REVOKE ALL ON assistant_logs FROM authenticated;

-- Make PostgREST pick up the new table without a restart. The Edge Function
-- inserts through PostgREST with the service role key, so its schema cache has
-- to know the table exists.
NOTIFY pgrst, 'reload schema';

COMMIT;
