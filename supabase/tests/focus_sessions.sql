-- Checks the focus timer (0036): who may log time on a task, no overlapping sessions, the archive lock.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/focus_sessions.sql
-- Everything happens in one transaction that is rolled back, so nothing is left behind.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name), now(), now(), '', '', '', ''
from (values ('f0000000-0000-4000-8000-000000000001', 'fs-teacher@test.invalid', 'FS Teacher'),
             ('f0000000-0000-4000-8000-000000000002', 'fs-ada@test.invalid', 'FS Ada'),
             ('f0000000-0000-4000-8000-000000000003', 'fs-out@test.invalid', 'FS Outsider')) v (id, email, name);
update public.users set role = 'instructor' where id = 'f0000000-0000-4000-8000-000000000001';
insert into public.courses (id, code, title, term, instructor_id)
values ('f0000000-0000-4000-a000-000000000001', 'FS-TEST', 'Focus test', 'Test', 'f0000000-0000-4000-8000-000000000001');
insert into public.course_enrollments (course_id, user_id) values
  ('f0000000-0000-4000-a000-000000000001', 'f0000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-a000-000000000001', 'f0000000-0000-4000-8000-000000000003');
insert into public.teams (id, course_id, name) values
  ('f0000000-0000-4000-a000-000000000002', 'f0000000-0000-4000-a000-000000000001', 'FS Team'),
  ('f0000000-0000-4000-a000-000000000003', 'f0000000-0000-4000-a000-000000000001', 'FS Other');
insert into public.team_members (team_id, user_id) values
  ('f0000000-0000-4000-a000-000000000002', 'f0000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-a000-000000000003', 'f0000000-0000-4000-8000-000000000003');
insert into public.tasks (id, team_id, title) values
  ('f0000000-0000-4000-b000-000000000001', 'f0000000-0000-4000-a000-000000000002', 'FS task'),
  ('f0000000-0000-4000-b000-000000000002', 'f0000000-0000-4000-a000-000000000003', 'FS other task');

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true)
$$;
create function pg_temp.ok(what text) returns void language plpgsql as $$ begin raise notice 'ok: %', what; end $$;

-- 1. Ada logs 25 minutes on her team's task; the time ends now, whatever she sends.
select pg_temp.as_user('f0000000-0000-4000-8000-000000000002');
insert into public.focus_sessions (task_id, team_id, minutes, ended_at)
values ('f0000000-0000-4000-b000-000000000001', 'f0000000-0000-4000-a000-000000000002', 25, now() - interval '3 days');
reset role;
do $$ begin
  assert (select ended_at from public.focus_sessions where task_id = 'f0000000-0000-4000-b000-000000000001') = now(), 'the session ends now';
  assert (select user_id from public.focus_sessions where task_id = 'f0000000-0000-4000-b000-000000000001') = 'f0000000-0000-4000-8000-000000000002', 'it is Ada''s';
end $$;
select pg_temp.ok('a member logs time on a task');

-- 2. A second session right away would overlap the first.
select pg_temp.as_user('f0000000-0000-4000-8000-000000000002');
do $$ begin
  insert into public.focus_sessions (task_id, team_id, minutes) values ('f0000000-0000-4000-b000-000000000001', 'f0000000-0000-4000-a000-000000000002', 25);
  raise exception 'an overlapping session was saved';
exception when raise_exception then
  if sqlerrm not like 'Focus sessions can''t overlap%' then raise; end if;
end $$;
-- 3. Not on another team's task, not under the wrong team, not for someone else. (The first session moves back a day,
--    so the overlap check doesn't answer first.)
reset role;
update public.focus_sessions set ended_at = now() - interval '1 day';
select pg_temp.as_user('f0000000-0000-4000-8000-000000000002');
do $$ begin
  insert into public.focus_sessions (task_id, team_id, minutes) values ('f0000000-0000-4000-b000-000000000002', 'f0000000-0000-4000-a000-000000000003', 5);
  raise exception 'time was logged on another team''s task';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.focus_sessions (task_id, team_id, minutes) values ('f0000000-0000-4000-b000-000000000002', 'f0000000-0000-4000-a000-000000000002', 5);
  raise exception 'a task was filed under the wrong team';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.focus_sessions (task_id, team_id, user_id, minutes)
  values ('f0000000-0000-4000-b000-000000000001', 'f0000000-0000-4000-a000-000000000002', 'f0000000-0000-4000-8000-000000000003', 5);
  raise exception 'time was logged for someone else';
exception when insufficient_privilege then null;
end $$;
reset role;
select pg_temp.ok('no overlap, no other team, no one else');

-- 4. The outsider sees nothing; the instructor sees the session.
select pg_temp.as_user('f0000000-0000-4000-8000-000000000003');
do $$ begin assert (select count(*) from public.focus_sessions) = 0, 'another team sees the time'; end $$;
select pg_temp.as_user('f0000000-0000-4000-8000-000000000001');
do $$ begin assert (select count(*) from public.focus_sessions) = 1, 'the instructor can''t see the time'; end $$;
reset role;
select pg_temp.ok('the team and the instructor see it, others don''t');

-- 5. An archived course takes no new time.
update public.courses set archived_at = now() where id = 'f0000000-0000-4000-a000-000000000001';
select pg_temp.as_user('f0000000-0000-4000-8000-000000000002');
do $$ begin
  insert into public.focus_sessions (task_id, team_id, minutes) values ('f0000000-0000-4000-b000-000000000001', 'f0000000-0000-4000-a000-000000000002', 25);
  raise exception 'time was logged in an archived course';
exception when raise_exception then
  if sqlerrm not like 'This course is archived%' then raise; end if;
end $$;
reset role;
select pg_temp.ok('archived courses take no time');

rollback;
