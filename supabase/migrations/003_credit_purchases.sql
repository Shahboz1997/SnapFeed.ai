-- Credit purchases (Stripe) + guest bonus credits
-- Run in Supabase Dashboard → SQL Editor

create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  email text not null,
  tier_id text not null,
  credits integer not null check (credits > 0),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  user_id uuid references auth.users(id) on delete set null,
  guest_fingerprint text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists credit_purchases_email_idx on public.credit_purchases (email);
create index if not exists credit_purchases_user_id_idx on public.credit_purchases (user_id);

alter table public.credit_purchases enable row level security;

-- No public policies — backend service_role only.

alter table public.guest_usage
  add column if not exists purchased_credits integer not null default 0 check (purchased_credits >= 0);
