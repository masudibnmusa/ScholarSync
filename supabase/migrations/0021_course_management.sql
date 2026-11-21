-- Course management: instructors control who joins, add students by email, and archive a course at term end.

alter table public.courses
  add column joining_open boolean not null default true,  -- false: no self-join from the catalog or an invite link
  add column archived_at timestamptz;                      -- set: the course is over and read-only

-- Students may join on their own only while the course is open and not archived.
drop policy enroll_self_insert on public.course_enrollments;
create policy enroll_self_insert on public.course_enrollments for insert
  with check (user_id = auth.uid() and not public.is_instructor()
              and exists (select 1 from public.courses c where c.id = course_id and c.joining_open and c.archived_at is null));

-- Enroll existing student accounts by email. Runs as definer because instructors can't read users outside their
-- courses; it only reports, per address, what happened, so it never exposes anything else about an account.
create function public.enroll_students(p_course uuid, p_emails text[])
returns table (address text, outcome text)  -- outcome: added | already | no_account | not_student
language plpgsql security definer set search_path = '' as $$
begin
  if not public.teaches_course(p_course) then
    raise exception 'Course not found or not yours';
  end if;
  if coalesce(array_length(p_emails, 1), 0) > 200 then
    raise exception 'Add at most 200 students at a time';
  end if;
  return query
  with input as (
    select distinct lower(trim(e)) as addr from unnest(p_emails) e where trim(e) <> ''
  ), found as (
    select i.addr, u.id as uid, u.role::text as urole from input i left join public.users u on lower(u.email) = i.addr
  ), ins as (
    insert into public.course_enrollments (course_id, user_id)
    select p_course, f.uid from found f where f.urole = 'student'
    on conflict do nothing
    returning user_id
  )
  select f.addr,
         case when f.uid is null then 'no_account'
              when f.urole <> 'student' then 'not_student'
              when f.uid in (select user_id from ins) then 'added'
              else 'already' end
  from found f order by f.addr;
end $$;
revoke execute on function public.enroll_students(uuid, text[]) from public, anon;
grant execute on function public.enroll_students(uuid, text[]) to authenticated;

-- Archived courses are read-only: one trigger on every table of team work and membership, instead of
-- changing each table's policies. Grading, announcements and the course itself stay editable, and the
-- instructor can restore the course. A cascade from deleting the course or team passes, because the
-- parent row is already gone when the child rows are removed.
create function public.block_archived_course() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  c uuid;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  -- Only users' requests are locked. Admin work and jobs (service role, deleting an account) pass, as they bypass RLS too.
  -- The "role" setting still holds the request's role here; security definer only changes current_user.
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then return r; end if;
  if tg_table_name in ('course_enrollments', 'teams') then
    c := r.course_id;
  elsif tg_table_name in ('task_comments', 'task_checklist_items') then
    select t.course_id into c from public.tasks k join public.teams t on t.id = k.team_id where k.id = r.task_id;
  else
    select t.course_id into c from public.teams t where t.id = r.team_id;
  end if;
  if exists (select 1 from public.courses where id = c and archived_at is not null) then
    raise exception 'This course is archived and read-only' using errcode = 'P0001', hint = 'Restore the course to make changes.';
  end if;
  return r;
end $$;

create trigger course_enrollments_archived before insert or update or delete on public.course_enrollments
  for each row execute function public.block_archived_course();
-- Insert and delete only: the nightly health job still updates teams.health_score.
create trigger teams_archived before insert or delete on public.teams
  for each row execute function public.block_archived_course();
create trigger team_members_archived before insert or update or delete on public.team_members
  for each row execute function public.block_archived_course();
create trigger tasks_archived before insert or update or delete on public.tasks
  for each row execute function public.block_archived_course();
create trigger messages_archived before insert or update or delete on public.messages
  for each row execute function public.block_archived_course();
create trigger files_archived before insert or update or delete on public.files
  for each row execute function public.block_archived_course();
create trigger peer_reviews_archived before insert or update or delete on public.peer_reviews
  for each row execute function public.block_archived_course();
create trigger team_milestones_archived before insert or update or delete on public.team_milestones
  for each row execute function public.block_archived_course();
create trigger task_comments_archived before insert or update or delete on public.task_comments
  for each row execute function public.block_archived_course();
create trigger task_checklist_items_archived before insert or update or delete on public.task_checklist_items
  for each row execute function public.block_archived_course();
