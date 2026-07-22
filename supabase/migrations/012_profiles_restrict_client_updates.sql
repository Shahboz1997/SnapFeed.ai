-- Restrict client self-updates of credits/plan fields.
revoke update on table public.profiles from authenticated;
revoke update on table public.profiles from anon;
grant update (full_name, avatar_url) on table public.profiles to authenticated;
