create table public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  crop_key text not null,
  display_name text not null,
  app_crop_names text[],
  price_min numeric,
  price_max numeric,
  unit text not null,
  contract_month text not null default '',
  source_date date not null,
  change_amount numeric,
  change_direction text,
  validation_status text not null default 'ok',
  validation_note text,
  raw jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index market_snapshots_source_crop_month_date_key
  on public.market_snapshots (source, crop_key, contract_month, source_date);

create index market_snapshots_lookup_idx
  on public.market_snapshots (crop_key, source, source_date desc);

alter table public.market_snapshots enable row level security;

create policy market_snapshots_read
  on public.market_snapshots
  for select
  to authenticated
  using (true);
