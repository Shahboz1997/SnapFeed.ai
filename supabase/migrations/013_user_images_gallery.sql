-- Per-user generated image gallery (metadata + private Storage bucket).

create table if not exists public.user_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  mode text,
  hashtags text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint user_images_storage_path_unique unique (storage_path)
);

create index if not exists user_images_user_id_created_at_idx
  on public.user_images (user_id, created_at desc);

alter table public.user_images enable row level security;

drop policy if exists "Users read own images" on public.user_images;
create policy "Users read own images"
  on public.user_images for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users delete own images" on public.user_images;
create policy "Users delete own images"
  on public.user_images for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Inserts/updates go through backend service_role only.
revoke all on table public.user_images from anon;
grant select, delete on table public.user_images to authenticated;
grant all on table public.user_images to service_role;

-- Private bucket: path layout {user_id}/{uuid}.png
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-gallery',
  'user-gallery',
  false,
  15728640,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Defense-in-depth storage policies (backend uses service_role and bypasses RLS).
drop policy if exists "Users read own gallery objects" on storage.objects;
create policy "Users read own gallery objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'user-gallery'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users delete own gallery objects" on storage.objects;
create policy "Users delete own gallery objects"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'user-gallery'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
