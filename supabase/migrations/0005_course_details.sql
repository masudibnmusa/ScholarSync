-- Course page: the instructor describes what the course is, its goals, and why to take it.
alter table public.courses
  add column description text not null default '' check (length(description) <= 4000),
  add column goals       text not null default '' check (length(goals) <= 4000),
  add column rationale   text not null default '' check (length(rationale) <= 4000);

-- The course page shows every viewer how many teams a course has; RLS would otherwise show a student only their own.
create function public.course_team_count(c uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.teams where course_id = c
$$;
