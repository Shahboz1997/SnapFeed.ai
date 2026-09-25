-- Atomic Lemon fulfill: ledger insert + credit grant in one transaction.
-- Prevents paid-without-credits (insert-then-fail) and double grants under retries.

create or replace function public.add_profile_credits(p_user_id uuid, p_amount integer)
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
  set credits = credits + p_amount
  where id = p_user_id
  returning credits into new_credits;

  if new_credits is null then
    raise exception 'profile not found';
  end if;

  return new_credits;
end;
$$;

revoke all on function public.add_profile_credits(uuid, integer) from public;
revoke all on function public.add_profile_credits(uuid, integer) from anon;
revoke all on function public.add_profile_credits(uuid, integer) from authenticated;
grant execute on function public.add_profile_credits(uuid, integer) to service_role;

create or replace function public.fulfill_lemon_order(
  p_order_id text,
  p_user_id uuid,
  p_plan_name text,
  p_credits integer,
  p_variant_id text default null,
  p_event_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  new_balance integer;
begin
  if p_order_id is null or length(trim(p_order_id)) = 0 then
    raise exception 'order id required';
  end if;

  if p_user_id is null then
    raise exception 'user id required';
  end if;

  if p_credits is null or p_credits < 1 then
    raise exception 'credits must be >= 1';
  end if;

  insert into public.lemon_orders (
    lemon_order_id,
    user_id,
    plan_name,
    credits,
    variant_id,
    event_name
  )
  values (
    trim(p_order_id),
    p_user_id,
    coalesce(nullif(trim(p_plan_name), ''), 'unknown'),
    p_credits,
    nullif(trim(coalesce(p_variant_id, '')), ''),
    nullif(trim(coalesce(p_event_name, '')), '')
  )
  on conflict (lemon_order_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return jsonb_build_object(
      'granted', false,
      'reason', 'already_fulfilled',
      'credits', p_credits
    );
  end if;

  new_balance := public.add_profile_credits(p_user_id, p_credits);

  return jsonb_build_object(
    'granted', true,
    'credits', p_credits,
    'balance', new_balance,
    'planName', coalesce(nullif(trim(p_plan_name), ''), 'unknown')
  );
end;
$$;

revoke all on function public.fulfill_lemon_order(text, uuid, text, integer, text, text) from public;
revoke all on function public.fulfill_lemon_order(text, uuid, text, integer, text, text) from anon;
revoke all on function public.fulfill_lemon_order(text, uuid, text, integer, text, text) from authenticated;
grant execute on function public.fulfill_lemon_order(text, uuid, text, integer, text, text) to service_role;
