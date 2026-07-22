-- 1 free credit for new authenticated users + 1 free guest generation.

alter table public.profiles
  alter column credits set default 1;

alter table public.guest_usage
  alter column max_generations set default 1;

-- Cap existing guest allowances to 1 free generation.
update public.guest_usage
set max_generations = 1
where max_generations > 1;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, credits)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    1
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  return new;
end;
$$;

-- One-time grant: empty balances get the free starter credit.
update public.profiles
set credits = 1
where credits = 0;
