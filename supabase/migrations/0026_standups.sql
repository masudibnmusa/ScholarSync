-- Weekly stand-up: every Monday each student says what they finished, what is next and what blocks them.
-- Team members and the course instructor read the answers; the AI turns them (with the team's weekly recap)
-- into a short summary that only the instructor reads.

create table public.standups (
  team_id    uuid not null references public.teams (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  week_start date not null,                                -- Monday (UTC) of the week answered for
  done       text not null default '' check (length(done) <= 1000),
  next       text not null default '' check (length(next) <= 1000),
  blocked    text not null default '' check (length(blocked) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id, week_start),
  check (done <> '' or next <> '' or blocked <> '')
);
create index standups_week_idx on public.standups (week_start);

alter table public.standups enable row level security;
create policy standups_select on public.standups for select using (public.can_view_team(team_id));
create policy standups_insert on public.standups for insert
  with check (user_id = auth.uid() and public.is_team_member(team_id));
create policy standups_update on public.standups for update
  using (user_id = auth.uid() and public.is_team_member(team_id))
  with check (user_id = auth.uid() and public.is_team_member(team_id));
create trigger standups_archived before insert or update or delete on public.standups
  for each row execute function public.block_archived_course();

create table public.standup_summaries (
  team_id      uuid not null references public.teams (id) on delete cascade,
  week_start   date not null,
  summary      text not null,
  blockers     text[] not null default '{}',
  answered     int not null,                               -- answers the summary was written from
  generated_at timestamptz not null default now(),
  primary key (team_id, week_start)
);
-- Written by the job (owner role); instructors only read.
alter table public.standup_summaries enable row level security;
create policy standup_summaries_select on public.standup_summaries for select using (public.teaches_team(team_id));

alter publication supabase_realtime add table public.standups, public.standup_summaries;
