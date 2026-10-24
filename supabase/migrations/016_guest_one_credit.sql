-- Guests get 1 free generation. Signed-in welcome credits stay unchanged.

alter table public.guest_usage
  alter column max_generations set default 1;

update public.guest_usage
set max_generations = 1
where max_generations > 1;
