-- Ensure guest credit claim lock column exists on profiles.
-- Run in Supabase Dashboard → SQL Editor if missing.

alter table public.profiles
  add column if not exists guest_fingerprint_claimed text;
