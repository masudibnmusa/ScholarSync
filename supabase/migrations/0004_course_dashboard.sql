-- Course dashboard: students browse every course and join or leave on their own; instructors create courses.

-- Course catalog: any signed-in user can see every course (code, title, term, instructor).
drop policy courses_select on public.courses;
create policy courses_select on public.courses for select to authenticated using (true);

-- So the catalog can show who teaches each course before a student joins it.
create policy users_select_instructors on public.users for select to authenticated using (role = 'instructor');

-- Students enroll and unenroll themselves; instructors keep managing their own course rosters (enroll_write).
create policy enroll_self_insert on public.course_enrollments for insert
  with check (user_id = auth.uid() and not public.is_instructor());
create policy enroll_self_delete on public.course_enrollments for delete
  using (user_id = auth.uid());

-- Catalog numbers a student may not otherwise read (other students' enrollments).
create function public.course_student_count(c uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.course_enrollments where course_id = c
$$;

-- Leaving a course also takes the student off that course's teams (members_write is instructor-only,
-- so this runs as definer). Only fires for the enrollment row actually deleted.
create function public.leave_course_teams() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.team_members m using public.teams t
   where t.id = m.team_id and t.course_id = old.course_id and m.user_id = old.user_id;
  return old;
end $$;

create trigger course_enrollments_leave_teams
  after delete on public.course_enrollments
  for each row execute function public.leave_course_teams();
