-- Team health over time, for the analytics trends. The nightly AI check overwrites teams.health_score; this keeps
-- one score per team per day (the last of the day). History starts when this migration runs.

create table public.team_health_history (
  team_id uuid not null references public.teams (id) on delete cascade,
  day     date not null,
  score   smallint not null check (score between 0 and 100),
  primary key (team_id, day)
);
alter table public.team_health_history enable row level security;
create policy team_health_history_select on public.team_health_history for select using (public.can_view_team(team_id));

create function public.record_team_health() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.health_score is not null and (tg_op = 'INSERT' or new.health_score is distinct from old.health_score) then
    insert into public.team_health_history (team_id, day, score) values (new.id, current_date, new.health_score)
      on conflict (team_id, day) do update set score = excluded.score;
  end if;
  return new;
end $$;
create trigger teams_health_history after insert or update of health_score on public.teams
  for each row execute function public.record_team_health();

-- Today's scores as the first point.
insert into public.team_health_history (team_id, day, score)
select id, current_date, health_score from public.teams where health_score is not null
on conflict do nothing;
