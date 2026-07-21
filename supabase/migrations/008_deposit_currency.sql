-- Add currency to deposit requests (RUB for RU, USD for EU/US)
-- Run in Supabase Dashboard → SQL Editor if table already exists

alter table public.deposit_requests
  add column if not exists currency text not null default 'RUB';

alter table public.deposit_requests
  drop constraint if exists deposit_requests_currency_check;

alter table public.deposit_requests
  add constraint deposit_requests_currency_check
  check (currency in ('RUB', 'USD', 'UZS', 'TJS'));
