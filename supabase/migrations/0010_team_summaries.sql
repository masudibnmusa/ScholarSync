-- Weekly AI recap per team: what got done, what is late, what was decided.
-- One row per team per week (Monday start); regenerating within the week replaces it.
-- Written only by the server (Inngest cron, or the "refresh" action after an access check), never by clients.
create table public.team_summaries (
  team_id      uuid not null references public.teams (id) on delete cascade,
  week_start   date not null,
  summary      text not null,
  done         text[] not null default '{}',
  late         text[] not null default '{}',
  decisions    text[] not null default '{}',
  generated_at timestamptz not null default now(),
  primary key (team_id, week_start)
);

alter table public.team_summaries enable row level security;
create policy summaries_select on public.team_summaries for select using (public.can_view_team(team_id));
