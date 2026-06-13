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
2. Copy .env.example to .env and fill in your Supabase URL and anon key
3. npm install
4. npm run dev

## Notes
- Default language is Kannada with English toggle
- Mobile-first layout (max-width 430px)
- Requires a live Supabase project with tables: users, rates, reviews, leads, reports
