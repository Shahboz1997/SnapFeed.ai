-- Guest generation limits (fingerprint / IP anti-fraud)
-- Run in Supabase Dashboard → SQL Editor

create table if not exists public.guest_usage (
  id uuid primary key default gen_random_uuid(),
  fingerprint_hash text not null unique,
  ip_address text,
  generations_used integer not null default 0 check (generations_used >= 0),
  max_generations integer not null default 3 check (max_generations > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists guest_usage_fingerprint_idx on public.guest_usage (fingerprint_hash);
create index if not exists guest_usage_ip_idx on public.guest_usage (ip_address);

alter table public.guest_usage enable row level security;

-- No policies: only service_role (backend) can read/write this table.
