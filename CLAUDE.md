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
