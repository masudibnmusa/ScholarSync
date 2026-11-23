-- Team retrospectives: after a milestone, each team writes what went well and what didn't. One shared answer per team and
-- milestone that any member can edit; the instructor reads them all (and can ask the AI for themes across teams).

create table public.team_retros (
  team_id      uuid not null references public.teams (id) on delete cascade,
  milestone_id uuid not null references public.course_milestones (id) on delete cascade,
  went_well    text not null default '' check (length(went_well) <= 2000),
  didnt        text not null default '' check (length(didnt) <= 2000),
  updated_by   uuid references public.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (team_id, milestone_id),
  check (length(trim(went_well)) > 0 or length(trim(didnt)) > 0)
);
create index team_retros_milestone_idx on public.team_retros (milestone_id);

alter table public.team_retros enable row level security;
create policy retros_select on public.team_retros for select using (public.can_view_team(team_id));
create policy retros_insert on public.team_retros for insert
  with check (public.is_team_member(team_id) and public.milestone_in_team_course(milestone_id, team_id));
create policy retros_update on public.team_retros for update
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
-- Members change only the answers; the keys stay.
revoke update on public.team_retros from authenticated, anon;
grant select, insert on public.team_retros to authenticated;
grant update (went_well, didnt) on public.team_retros to authenticated;

-- The writer and time come from the session, not the client.
create function public.stamp_team_retro() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger team_retros_stamp before insert or update on public.team_retros
  for each row execute function public.stamp_team_retro();
create trigger team_retros_archived before insert or update on public.team_retros
  for each row execute function public.block_archived_course();

alter publication supabase_realtime add table public.team_retros;
