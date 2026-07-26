-- Engagement: 3 free credits, referrals, collections, monthly plan, email flags.

-- ── Referral / email fields on profiles (before handle_new_user) ─
alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.profiles(id) on delete set null,
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists low_credit_email_sent_at timestamptz;

create unique index if not exists profiles_referral_code_uidx
  on public.profiles (referral_code)
  where referral_code is not null;

-- ── Guest + new-user free credits (3) ──────────────────────────
alter table public.profiles
  alter column credits set default 3;

alter table public.guest_usage
  alter column max_generations set default 3;

update public.guest_usage
set max_generations = 3
where max_generations < 3;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
begin
  new_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.profiles (
    id, email, full_name, avatar_url, credits, referral_code
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    3,
    new_code
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    referral_code = coalesce(public.profiles.referral_code, excluded.referral_code),
    updated_at = now();

  return new;
end;
$$;

-- One-time: empty balances get the free starter credits.
update public.profiles
set credits = 3
where credits = 0;

-- Backfill referral codes for existing users.
update public.profiles
set referral_code = lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where referral_code is null;

-- ── Referral redemptions (idempotent) ──────────────────────────
create table if not exists public.referral_redemptions (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referee_id uuid not null references public.profiles(id) on delete cascade,
  credits_each integer not null default 2 check (credits_each > 0),
  created_at timestamptz not null default now(),
  constraint referral_redemptions_referee_unique unique (referee_id)
);

create index if not exists referral_redemptions_referrer_idx
  on public.referral_redemptions (referrer_id);

alter table public.referral_redemptions enable row level security;

drop policy if exists "Users read own referral redemptions" on public.referral_redemptions;
create policy "Users read own referral redemptions"
  on public.referral_redemptions for select
  to authenticated
  using (
    (select auth.uid()) = referrer_id
    or (select auth.uid()) = referee_id
  );

revoke all on table public.referral_redemptions from anon;
grant select on table public.referral_redemptions to authenticated;
grant all on table public.referral_redemptions to service_role;

-- ── Gallery collections ────────────────────────────────────────
alter table public.user_images
  add column if not exists collection text;

create index if not exists user_images_user_collection_idx
  on public.user_images (user_id, collection)
  where collection is not null;

-- ── Monthly subscription pack (manual deposit) ─────────────────
alter table public.deposit_requests
  drop constraint if exists deposit_requests_plan_name_check;

alter table public.deposit_requests
  add constraint deposit_requests_plan_name_check
  check (plan_name in ('single', 'starter', 'pro', 'business', 'monthly'));
