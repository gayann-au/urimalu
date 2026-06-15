# Urimalu

A mobile-first marketplace for farmers
to compare daily merchant rates for coffee, pepper, cardamom, and arecanut.

## Tech Stack
- Vite + React 18 + Tailwind CSS
- Supabase (auth, Postgres, realtime)
- react-router-dom v6, react-query v5, Zustand
- react-hook-form + zod, recharts, i18next

## Setup
1. Clone the repo
2. Copy .env.example to .env and fill in your Supabase URL, anon key, and Google client id
3. npm install
4. npm run dev

## Notes
- Sign in with Google (Google Identity Services One Tap) signs in existing accounts only; the credential is verified by Supabase via signInWithIdToken. Enable the Google provider in Supabase and set VITE_GOOGLE_CLIENT_ID to the same client id.
- Default language is Kannada with English toggle
- Mobile-first layout (max-width 430px)
- Requires a live Supabase project with tables: users, rates, reviews, leads, reports
