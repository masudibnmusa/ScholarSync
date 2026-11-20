-- Milestones: checkpoints the instructor sets per course ("Proposal due 1 Dec"); each team marks them done.
create table public.course_milestones (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  due_date    date not null,
  created_at  timestamptz not null default now()
);
create index course_milestones_course_idx on public.course_milestones (course_id, due_date);

create table public.team_milestones (
  team_id      uuid not null references public.teams (id) on delete cascade,
  milestone_id uuid not null references public.course_milestones (id) on delete cascade,
  completed_at timestamptz not null default now(),
  completed_by uuid references public.users (id) on delete set null default auth.uid(),
  primary key (team_id, milestone_id)
);

-- A milestone can only be marked by a team in the same course.
create function public.milestone_in_team_course(m uuid, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.course_milestones cm join public.teams tm on tm.course_id = cm.course_id
                 where cm.id = m and tm.id = t)
$$;

alter table public.course_milestones enable row level security;
alter table public.team_milestones   enable row level security;

create policy milestones_select on public.course_milestones for select
  using (public.teaches_course(course_id) or public.is_enrolled(course_id));
create policy milestones_write on public.course_milestones for all
  using (public.teaches_course(course_id)) with check (public.teaches_course(course_id));

create policy team_ms_select on public.team_milestones for select using (public.can_view_team(team_id));
create policy team_ms_insert on public.team_milestones for insert
  with check (public.is_team_member(team_id) and completed_by = auth.uid()
              and public.milestone_in_team_course(milestone_id, team_id));
create policy team_ms_delete on public.team_milestones for delete using (public.is_team_member(team_id));

-- New milestone: tell every enrolled student.
create function public.on_milestone_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select e.user_id, 'system', 'New milestone: ' || new.title,
         c.code || ' · due ' || to_char(new.due_date, 'Dy DD Mon'),
         '/student/courses/' || new.course_id
  from public.course_enrollments e join public.courses c on c.id = e.course_id
  where e.course_id = new.course_id;
  return new;
end $$;
create trigger milestones_notify after insert on public.course_milestones
  for each row execute function public.on_milestone_created();
