-- Grading: the instructor defines a rubric per course, marks each team against it, and each student's grade is the
-- team's percentage times a contribution factor (suggested from peer reviews, saved when the team is graded).
-- Students see their team's marks and their own grade only after the instructor releases grades.

alter table public.courses add column grades_released boolean not null default false;

create table public.rubric_criteria (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 80),
  max_points integer not null check (max_points between 1 and 1000),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index rubric_criteria_course_idx on public.rubric_criteria (course_id, position);

create table public.team_grades (
  team_id      uuid not null references public.teams (id) on delete cascade,
  criterion_id uuid not null references public.rubric_criteria (id) on delete cascade,
  points       numeric(6, 1) not null check (points >= 0),
  feedback     text not null default '' check (length(feedback) <= 2000),
  updated_at   timestamptz not null default now(),
  primary key (team_id, criterion_id)
);

create table public.student_grade_factors (
  team_id    uuid not null references public.teams (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  factor     numeric(4, 2) not null check (factor between 0.5 and 1.5),
  overridden boolean not null default false,
  primary key (team_id, user_id)
);

create function public.team_grades_released(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.grades_released from public.teams tm join public.courses c on c.id = tm.course_id where tm.id = t), false)
$$;

-- Points are capped by the criterion, and a criterion must belong to the team's course.
create function public.check_team_grade() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap integer;
begin
  select rc.max_points into cap
  from public.rubric_criteria rc join public.teams t on t.course_id = rc.course_id
  where rc.id = new.criterion_id and t.id = new.team_id;
  if cap is null then raise exception 'Criterion is not part of this team''s course'; end if;
  if new.points > cap then raise exception 'Points (%) exceed the maximum (%)', new.points, cap; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger team_grades_check before insert or update on public.team_grades
  for each row execute function public.check_team_grade();

alter table public.rubric_criteria       enable row level security;
alter table public.team_grades           enable row level security;
alter table public.student_grade_factors enable row level security;

create policy rubric_select on public.rubric_criteria for select
  using (public.teaches_course(course_id) or public.is_enrolled(course_id));
create policy rubric_write on public.rubric_criteria for all
  using (public.teaches_course(course_id)) with check (public.teaches_course(course_id));

create policy grades_select on public.team_grades for select
  using (public.teaches_team(team_id) or (public.is_team_member(team_id) and public.team_grades_released(team_id)));
create policy grades_write on public.team_grades for all
  using (public.teaches_team(team_id)) with check (public.teaches_team(team_id));

create policy factors_select on public.student_grade_factors for select
  using (public.teaches_team(team_id) or (user_id = auth.uid() and public.team_grades_released(team_id)));
create policy factors_write on public.student_grade_factors for all
  using (public.teaches_team(team_id)) with check (public.teaches_team(team_id));

-- Releasing grades tells every student on a graded team.
create function public.on_grades_released() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.grades_released and not old.grades_released then
    insert into public.notifications (user_id, type, title, body, link)
    select distinct m.user_id, 'system'::public.notification_type, 'Grades released for ' || new.code,
           'Your team''s marks and feedback are on the course page.', '/student/courses/' || new.id
    from public.teams t
    join public.team_members m on m.team_id = t.id
    where t.course_id = new.id and exists (select 1 from public.team_grades g where g.team_id = t.id);
  end if;
  return new;
end $$;
create trigger courses_grades_released after update of grades_released on public.courses
  for each row execute function public.on_grades_released();
