-- Allow single-generation deposit pack (1 credit / 20 RUB)
-- Run in Supabase Dashboard → SQL Editor if not applied via CLI

alter table public.deposit_requests
  drop constraint if exists deposit_requests_plan_name_check;

alter table public.deposit_requests
  add constraint deposit_requests_plan_name_check
  check (plan_name in ('single', 'starter', 'pro', 'business'));
