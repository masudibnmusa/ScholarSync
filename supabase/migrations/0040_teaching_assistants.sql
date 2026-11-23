-- Teaching assistants: the course's instructor adds staff accounts (instructor role) as TAs. A TA sees every team in the
-- course like the instructor does, grades (team marks, contribution factors, hand-in feedback) and moderates the help
-- board, but doesn't own the course: no editing, archiving or deleting it, no roster, teams, rubric, milestones,
-- announcements, office hours or releasing grades.

create table public.course_tas (
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id   uuid not null references public.users (id) on delete cascade,
  added_by  uuid default auth.uid() references public.users (id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (course_id, user_id)
);
create index course_tas_user_idx on public.course_tas (user_id);

create function public.assists_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.course_tas where course_id = c and user_id = auth.uid())
$$;
create function public.assists_team(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teams tm join public.course_tas a on a.course_id = tm.course_id
                 where tm.id = t and a.user_id = auth.uid())
$$;
-- Course staff: the instructor or one of its TAs.
create function public.staffs_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.teaches_course(c) or public.assists_course(c) $$;
create function public.staffs_team(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.teaches_team(t) or public.assists_team(t) $$;

alter table public.course_tas enable row level security;
create policy tas_select on public.course_tas for select using (public.teaches_course(course_id) or user_id = auth.uid());
create policy tas_insert on public.course_tas for insert with check (public.teaches_course(course_id));
create policy tas_delete on public.course_tas for delete using (public.teaches_course(course_id));
grant select, insert, delete on public.course_tas to authenticated;

-- A TA is another staff account, not a student and not the instructor; the new TA is told.
create function public.guard_course_ta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  select code, title, instructor_id into c from public.courses where id = new.course_id;
  if new.user_id = c.instructor_id then raise exception 'You already teach this course' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.users where id = new.user_id and role = 'instructor') then
    raise exception 'Only staff accounts can be teaching assistants' using errcode = 'P0001';
  end if;
  perform public.notify(new.user_id, 'system', 'You are a teaching assistant for ' || c.code, c.title, '/instructor/courses/' || new.course_id);
  return new;
end $$;
create trigger course_tas_guard before insert on public.course_tas
  for each row execute function public.guard_course_ta();

-- Seeing teams: everything behind can_view_team (tasks, chat, files, stand-ups, hand-ins…) now includes TAs.
create or replace function public.can_view_team(t uuid) returns boolean
language sql stable as $$ select public.is_team_member(t) or public.teaches_team(t) or public.assists_team(t) $$;

-- The help board: TAs read, answer and moderate.
create or replace function public.in_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.is_enrolled(c) or public.staffs_course(c) $$;
drop policy help_q_delete on public.help_questions;
create policy help_q_delete on public.help_questions for delete using (author_id = auth.uid() or public.staffs_course(course_id));
drop policy help_a_delete on public.help_answers;
create policy help_a_delete on public.help_answers for delete using (author_id = auth.uid() or public.staffs_course(public.question_course(question_id)));

-- Reading what the instructor reads about the course and its teams.
drop policy announcements_select on public.course_announcements;
create policy announcements_select on public.course_announcements for select using (public.staffs_course(course_id) or public.is_enrolled(course_id));
drop policy milestones_select on public.course_milestones;
create policy milestones_select on public.course_milestones for select using (public.staffs_course(course_id) or public.is_enrolled(course_id));
drop policy office_hours_select on public.office_hours;
create policy office_hours_select on public.office_hours for select using (public.staffs_course(course_id) or public.is_enrolled(course_id));
drop policy rubric_select on public.rubric_criteria;
create policy rubric_select on public.rubric_criteria for select using (public.staffs_course(course_id) or public.is_enrolled(course_id));
drop policy enroll_select on public.course_enrollments;
create policy enroll_select on public.course_enrollments for select using (user_id = auth.uid() or public.staffs_course(course_id));
drop policy alerts_select on public.conflict_alerts;
create policy alerts_select on public.conflict_alerts for select using (public.staffs_team(team_id));
drop policy falling_behind_select on public.falling_behind;
create policy falling_behind_select on public.falling_behind for select using (public.staffs_team(team_id));
drop policy reviews_select on public.peer_reviews;
create policy reviews_select on public.peer_reviews for select using (reviewer_id = auth.uid() or public.staffs_team(team_id));
drop policy standup_summaries_select on public.standup_summaries;
create policy standup_summaries_select on public.standup_summaries for select using (public.staffs_team(team_id));

-- Grading.
drop policy grades_select on public.team_grades;
create policy grades_select on public.team_grades for select
  using (public.staffs_team(team_id) or (public.is_team_member(team_id) and public.team_grades_released(team_id)));
drop policy grades_write on public.team_grades;
create policy grades_write on public.team_grades for all using (public.staffs_team(team_id)) with check (public.staffs_team(team_id));
drop policy factors_select on public.student_grade_factors;
create policy factors_select on public.student_grade_factors for select
  using (public.staffs_team(team_id) or (user_id = auth.uid() and public.team_grades_released(team_id)));
drop policy factors_write on public.student_grade_factors;
create policy factors_write on public.student_grade_factors for all using (public.staffs_team(team_id)) with check (public.staffs_team(team_id));

-- Names: a TA sees the course's students, and the students see their TAs (staff are visible already: users_select_instructors).
create or replace function public.shares_context(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select u = auth.uid()
      or exists (select 1 from public.team_members a join public.team_members b using (team_id)
                 where a.user_id = auth.uid() and b.user_id = u)
      or exists (select 1 from public.courses c join public.course_enrollments e on e.course_id = c.id
                 where c.instructor_id = auth.uid() and e.user_id = u)
      or exists (select 1 from public.team_members m join public.teams t on t.id = m.team_id
                 join public.courses c on c.id = t.course_id
                 where c.instructor_id = auth.uid() and m.user_id = u)
      or exists (select 1 from public.course_enrollments e join public.courses c on c.id = e.course_id
                 where e.user_id = auth.uid() and c.instructor_id = u)
      or exists (select 1 from public.course_tas a join public.course_enrollments e using (course_id)
                 where a.user_id = auth.uid() and e.user_id = u)
      or exists (select 1 from public.course_tas a join public.teams t on t.course_id = a.course_id
                 join public.team_members m on m.team_id = t.id where a.user_id = auth.uid() and m.user_id = u)
$$;

-- Hand-ins: staff write only the feedback columns (0022 let only the instructor; a TA would have counted as the team).
create or replace function public.guard_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then return new; end if;
  if public.staffs_team(new.team_id) and not public.is_team_member(new.team_id) then
    if tg_op = 'INSERT' then raise exception 'Only the team can hand in work'; end if;
    new.link := old.link; new.storage_path := old.storage_path; new.file_name := old.file_name; new.file_size := old.file_size;
    new.note := old.note; new.submitted_by := old.submitted_by; new.submitted_at := old.submitted_at;
    new.feedback_by := auth.uid(); new.feedback_at := now();
  else
    if exists (select 1 from public.teams t join public.courses c on c.id = t.course_id where t.id = new.team_id and c.archived_at is not null) then
      raise exception 'This course is archived and read-only' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' then
      new.feedback := old.feedback; new.feedback_by := old.feedback_by; new.feedback_at := old.feedback_at;
    else
      new.feedback := ''; new.feedback_by := null; new.feedback_at := null;
    end if;
    new.submitted_by := auth.uid(); new.submitted_at := now();
  end if;
  return new;
end $$;

-- Extensions stay between the team and the instructor: a TA can read them (can_view_team) but not change them.
create function public.guard_extension_ta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and public.assists_team(new.team_id) and not public.is_team_member(new.team_id) and not public.teaches_team(new.team_id) then
    raise exception 'Only the team and the instructor can change a request for more time' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger extensions_guard_ta before insert or update on public.deadline_extensions
  for each row execute function public.guard_extension_ta();

alter publication supabase_realtime add table public.course_tas;
