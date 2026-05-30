# CoorgRate

Mobile-first React + Vite app helping farmers in Kodagu (Coorg) compare local merchant rates for Coffee, Pepper, Cardamom and Arecanut, and check merchant reputation before selling.

100% local — no backend, no Firebase, no API calls. All data is hardcoded mock data and persisted in `localStorage` only.

## Stack
- React 18 + Vite
- Tailwind CSS (custom Coorg green palette)
- React Router DOM v6
- Recharts (rate history bar chart)

## Run
```bash
npm install
npm run dev
```
Open http://localhost:5173

## Features
- **Rate Feed (/)** — Filter by crop, pickup availability, payment terms. Sort by Highest Rate / Best Rated / Most Recent. Tap call/WhatsApp directly from each card.
- **Merchant Profile (/merchant/:id)** — Rating, member since, current rate per crop with 7-day Recharts bar chart, reviews list, "I dealt with this merchant" review form.
- **Merchant Login (/merchant-login)** — Mock login: any email + password works.
- **Merchant Dashboard (/dashboard)** — Post/update today's rate per crop, mock weekly analytics (views / WhatsApp / call clicks), reviews received.

## Language
Kannada / English toggle in the header. Default is Kannada. Choice is saved to `localStorage`.

## Mock data
- 5 merchants across Kodagu (Madikeri, Virajpet, Gonikoppal, Pollibetta, Somwarpet)
- 4 crops: Coffee, Pepper, Cardamom, Arecanut
- 7-day rate history per merchant per crop
- 3–5 reviews per merchant
