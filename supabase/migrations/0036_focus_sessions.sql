-- Focus timer: a student runs a 25-minute timer on a task; each finished (or stopped) session is saved here.
-- The task shows its total and the contribution report shows each student's.

create table public.focus_sessions (
  id       uuid primary key default gen_random_uuid(),
  task_id  uuid not null references public.tasks (id) on delete cascade,
  team_id  uuid not null references public.teams (id) on delete cascade, -- the task's team, for RLS and the archive lock
  user_id  uuid not null default auth.uid() references public.users (id) on delete cascade,
  minutes  integer not null check (minutes between 1 and 60),
  ended_at timestamptz not null default now()
);
create index focus_sessions_task_idx on public.focus_sessions (task_id);
create index focus_sessions_user_idx on public.focus_sessions (user_id, ended_at);

alter table public.focus_sessions enable row level security;
create policy focus_select on public.focus_sessions for select using (public.can_view_team(team_id));
create policy focus_insert on public.focus_sessions for insert
  with check (user_id = auth.uid() and public.is_team_member(team_id) and public.task_team(task_id) = team_id);
grant select, insert on public.focus_sessions to authenticated;

-- A session ends now, and can't overlap the same person's previous one, so nobody logs more time than has passed.
create function public.guard_focus() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then return new; end if;
  new.ended_at := now();
  if exists (select 1 from public.focus_sessions where user_id = new.user_id and ended_at > now() - make_interval(mins => new.minutes)) then
    raise exception 'Focus sessions can''t overlap' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger focus_sessions_guard before insert on public.focus_sessions
  for each row execute function public.guard_focus();
create trigger focus_sessions_archived before insert on public.focus_sessions
  for each row execute function public.block_archived_course();

alter publication supabase_realtime add table public.focus_sessions;
