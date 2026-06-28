-- Prevent clients from self-updating credits/plan; track one-time guest credit transfer.

alter table public.profiles
  add column if not exists guest_fingerprint_claimed text;

revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url) on table public.profiles to authenticated;

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
