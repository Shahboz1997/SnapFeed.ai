-- Guest generation limits + atomic profile credit deduction.
-- Applied via Supabase MCP; keep this file for local/docs parity.

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

alter table public.profiles
  alter column credits set default 0;

create or replace function public.consume_profile_credits(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_credits integer;
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  if p_amount is null or p_amount < 1 then
    raise exception 'amount must be >= 1';
  end if;

  update public.profiles
  set credits = credits - p_amount
  where id = p_user_id
    and credits >= p_amount
  returning credits into new_credits;

  return new_credits;
end;
$$;

revoke all on function public.consume_profile_credits(uuid, integer) from public;
revoke all on function public.consume_profile_credits(uuid, integer) from anon;
revoke all on function public.consume_profile_credits(uuid, integer) from authenticated;
grant execute on function public.consume_profile_credits(uuid, integer) to service_role;

revoke all on table public.guest_usage from public;
revoke all on table public.guest_usage from anon;
revoke all on table public.guest_usage from authenticated;
grant all on table public.guest_usage to service_role;
