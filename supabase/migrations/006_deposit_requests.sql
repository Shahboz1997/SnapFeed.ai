-- Manual deposit requests (pending Stripe)
-- Run in Supabase Dashboard → SQL Editor
-- After: supabase/migrations/001_profiles.sql

create table if not exists public.deposit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_name text not null check (plan_name in ('single', 'starter', 'pro', 'business')),
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'RUB' check (currency in ('RUB', 'USD', 'UZS', 'TJS')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists deposit_requests_user_id_idx
  on public.deposit_requests (user_id);

create index if not exists deposit_requests_status_idx
  on public.deposit_requests (status);

create index if not exists deposit_requests_created_at_idx
  on public.deposit_requests (created_at desc);

alter table public.deposit_requests enable row level security;

drop policy if exists "Users read own deposit requests" on public.deposit_requests;
create policy "Users read own deposit requests"
  on public.deposit_requests for select
  using (auth.uid() = user_id);

-- Inserts/updates only via backend service_role (bypasses RLS).
grant select on table public.deposit_requests to authenticated;
