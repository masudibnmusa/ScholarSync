-- Rubric checklist: before handing in a milestone, the team ticks off the course's grading criteria. One row per tick;
-- unticking deletes it. Shared by the team and live, so everyone sees what's been checked.

create table public.rubric_checks (
  team_id      uuid not null references public.teams (id) on delete cascade,
  milestone_id uuid not null references public.course_milestones (id) on delete cascade,
  criterion_id uuid not null references public.rubric_criteria (id) on delete cascade,
  checked_by   uuid default auth.uid() references public.users (id) on delete set null,
  checked_at   timestamptz not null default now(),
  primary key (team_id, milestone_id, criterion_id)
);
create index rubric_checks_milestone_idx on public.rubric_checks (milestone_id);
create index rubric_checks_criterion_idx on public.rubric_checks (criterion_id);

-- The criterion belongs to the team's course.
create function public.criterion_in_team_course(c uuid, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rubric_criteria r join public.teams tm on tm.course_id = r.course_id where r.id = c and tm.id = t)
$$;

alter table public.rubric_checks enable row level security;
create policy rubric_checks_select on public.rubric_checks for select using (public.can_view_team(team_id));
create policy rubric_checks_insert on public.rubric_checks for insert
  with check (public.is_team_member(team_id) and checked_by = auth.uid()
              and public.milestone_in_team_course(milestone_id, team_id) and public.criterion_in_team_course(criterion_id, team_id));
create policy rubric_checks_delete on public.rubric_checks for delete using (public.is_team_member(team_id));
grant select, insert, delete on public.rubric_checks to authenticated;

create trigger rubric_checks_archived before insert or delete on public.rubric_checks
  for each row execute function public.block_archived_course();

alter publication supabase_realtime add table public.rubric_checks;
