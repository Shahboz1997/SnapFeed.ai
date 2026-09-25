-- Lemon Squeezy order ledger (idempotent credit grants)
-- Run in Supabase SQL Editor after creating Lemon products + webhook.

create table if not exists public.lemon_orders (
  id uuid primary key default gen_random_uuid(),
  lemon_order_id text not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_name text not null,
  credits integer not null check (credits > 0),
  variant_id text,
  event_name text,
  created_at timestamptz not null default now()
);

create index if not exists lemon_orders_user_id_idx on public.lemon_orders (user_id);
create index if not exists lemon_orders_created_at_idx on public.lemon_orders (created_at desc);

alter table public.lemon_orders enable row level security;

-- No anon/authenticated policies: only service_role (backend) reads/writes.
