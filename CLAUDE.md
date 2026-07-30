# Project Instructions for Claude Code

## Working Directory
Always work directly in the current directory. Never create a worktree. All file edits must land in the actual project folder, not a separate worktree copy.

## Code Standards
- No em dashes anywhere in code or comments
- Build after each major section to confirm it compiles
- Do NOT commit unless explicitly instructed to

## Stack
- React + Vite frontend
- Supabase (Postgres + Auth + RLS) backend
- Framer Motion for animations
- i18next for Kannada/English language support
- Deployed on Netlify

## Design System
- Design tokens are in tailwind.config.js (chilli, crop, ember, ink, paper colors)
- Motion config is in src/lib/uiMotion.js
- Always use existing tokens, never invent new color values

## Database
NEVER run `supabase db push` against this project. Not ever, for any reason.

Migrations here are applied BY HAND in the Supabase SQL editor first, and the
migration file is committed afterwards as a written record. Because of that,
the `supabase_migrations.schema_migrations` tracking table is EMPTY. The CLI
reads that table to decide what has already run, so it believes NOTHING has
been applied.

Running `supabase db push` would therefore replay all migration files against
the live production database from scratch. One of them,
20260718000001_phone_numbers_add_91_prefix.sql, rewrites phone number data.
Re-running it would corrupt every merchant and farmer phone number in the
users table, breaking every call and WhatsApp link in the app. There is no undo.

The same applies to `supabase db reset`, `supabase migration up`, and any other
command that applies migrations in bulk.

To make a database change:
1. Write the SQL and show it to the owner with a statement by statement
   breakdown naming exactly which objects are touched and which are NOT.
2. Give read-only verification queries to run BEFORE the change.
3. The owner runs the SQL themselves in the Supabase SQL editor.
4. Only then, write the migration file and commit it as the record.

Never claim certainty about the live database state. Read it or ask.
