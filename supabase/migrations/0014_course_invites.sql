-- Course invite links: every course gets a short join code; /join/<code> lets a student join in one click.
-- Students can already join any course from the catalog, so the code is a shortcut, not a secret.

-- 6 characters from 31 without look-alikes (no 0/O, 1/I/L): ~887 million codes. The unique constraint
-- turns the rare collision into an insert error the instructor can simply retry.
create function public.new_join_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6)
$$;

-- A volatile default is evaluated per row, so existing courses each get their own code.
alter table public.courses add column join_code text not null unique default public.new_join_code();
