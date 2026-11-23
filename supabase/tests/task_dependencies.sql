-- Checks task dependencies (0038): links stay inside one team, no loops, who may link, the "ready to start" notification,
-- and the archive lock.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/task_dependencies.sql
-- Everything happens in one transaction that is rolled back, so nothing is left behind.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name), now(), now(), '', '', '', ''
from (values ('d0000000-0000-4000-8000-000000000001', 'td-teacher@test.invalid', 'TD Teacher'),
             ('d0000000-0000-4000-8000-000000000002', 'td-ada@test.invalid', 'TD Ada'),
             ('d0000000-0000-4000-8000-000000000003', 'td-ben@test.invalid', 'TD Ben'),
             ('d0000000-0000-4000-8000-000000000004', 'td-out@test.invalid', 'TD Other team')) v (id, email, name);
update public.users set role = 'instructor' where id = 'd0000000-0000-4000-8000-000000000001';
insert into public.courses (id, code, title, term, instructor_id)
values ('d0000000-0000-4000-a000-000000000001', 'TD-TEST', 'Dependency test', 'Test', 'd0000000-0000-4000-8000-000000000001');
insert into public.course_enrollments (course_id, user_id)
select 'd0000000-0000-4000-a000-000000000001', id::uuid
from (values ('d0000000-0000-4000-8000-000000000002'), ('d0000000-0000-4000-8000-000000000003'), ('d0000000-0000-4000-8000-000000000004')) v (id);
insert into public.teams (id, course_id, name) values
  ('d0000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-a000-000000000001', 'TD Team'),
  ('d0000000-0000-4000-a000-000000000003', 'd0000000-0000-4000-a000-000000000001', 'TD Other');
insert into public.team_members (team_id, user_id) values
  ('d0000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-a000-000000000003', 'd0000000-0000-4000-8000-000000000004');
-- A = schema, C = API (both Ada's); B = UI (Ben's) waits on both. X belongs to the other team.
insert into public.tasks (id, team_id, title, assignee_id) values
  ('d0000000-0000-4000-b000-00000000000a', 'd0000000-0000-4000-a000-000000000002', 'TD schema', 'd0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-b000-00000000000b', 'd0000000-0000-4000-a000-000000000002', 'TD UI', 'd0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-b000-00000000000c', 'd0000000-0000-4000-a000-000000000002', 'TD API', 'd0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-b000-0000000000ff', 'd0000000-0000-4000-a000-000000000003', 'TD elsewhere', 'd0000000-0000-4000-8000-000000000004');

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true)
$$;
create function pg_temp.ok(what text) returns void language plpgsql as $$ begin raise notice 'ok: %', what; end $$;
create function pg_temp.link(task text, blocker text, team text) returns void language sql as $$
  insert into public.task_dependencies (task_id, blocked_by, team_id) values (task::uuid, blocker::uuid, team::uuid)
$$;
create function pg_temp.ready(who text) returns bigint language sql as $$
  select count(*) from public.notifications where user_id = who::uuid and title = 'Ready to start: TD UI'
$$;

-- 1. Ada links B to A and C; Ben sees the links, the instructor too, the other team doesn't.
select pg_temp.as_user('d0000000-0000-4000-8000-000000000002');
select pg_temp.link('d0000000-0000-4000-b000-00000000000b', 'd0000000-0000-4000-b000-00000000000a', 'd0000000-0000-4000-a000-000000000002');
select pg_temp.link('d0000000-0000-4000-b000-00000000000b', 'd0000000-0000-4000-b000-00000000000c', 'd0000000-0000-4000-a000-000000000002');
select pg_temp.as_user('d0000000-0000-4000-8000-000000000003');
do $$ begin assert (select count(*) from public.task_dependencies) = 2, 'Ben doesn''t see the links'; end $$;
select pg_temp.as_user('d0000000-0000-4000-8000-000000000001');
do $$ begin assert (select count(*) from public.task_dependencies) = 2, 'the instructor doesn''t see the links'; end $$;
select pg_temp.as_user('d0000000-0000-4000-8000-000000000004');
do $$ begin assert (select count(*) from public.task_dependencies) = 0, 'another team sees the links'; end $$;
reset role;
select pg_temp.ok('the team links tasks; the team and instructor see it');

-- 2. No loops (directly or through another task), no links across teams, none by outsiders.
select pg_temp.as_user('d0000000-0000-4000-8000-000000000003');
do $$ begin
  perform pg_temp.link('d0000000-0000-4000-b000-00000000000a', 'd0000000-0000-4000-b000-00000000000b', 'd0000000-0000-4000-a000-000000000002');
  raise exception 'a loop was accepted';
exception when raise_exception then
  if sqlerrm not like 'That would make the tasks wait on each other%' then raise; end if;
end $$;
select pg_temp.link('d0000000-0000-4000-b000-00000000000c', 'd0000000-0000-4000-b000-00000000000a', 'd0000000-0000-4000-a000-000000000002'); -- C waits on A: fine
do $$ begin
  perform pg_temp.link('d0000000-0000-4000-b000-00000000000a', 'd0000000-0000-4000-b000-00000000000c', 'd0000000-0000-4000-a000-000000000002');
  raise exception 'a two-step loop was accepted';
exception when raise_exception then
  if sqlerrm not like 'That would make the tasks wait on each other%' then raise; end if;
end $$;
do $$ begin
  perform pg_temp.link('d0000000-0000-4000-b000-00000000000b', 'd0000000-0000-4000-b000-0000000000ff', 'd0000000-0000-4000-a000-000000000002');
  raise exception 'a task waited on another team''s task';
exception when insufficient_privilege then null;
end $$;
select pg_temp.as_user('d0000000-0000-4000-8000-000000000004');
do $$ begin
  perform pg_temp.link('d0000000-0000-4000-b000-00000000000a', 'd0000000-0000-4000-b000-00000000000b', 'd0000000-0000-4000-a000-000000000002');
  raise exception 'another team linked our tasks';
exception when insufficient_privilege or raise_exception then null;
end $$;
delete from public.task_dependencies;
reset role;
do $$ begin assert (select count(*) from public.task_dependencies) = 3, 'another team removed links'; end $$;
select pg_temp.ok('no loops, no links across teams or by outsiders');

-- 3. Ada finishes A: B still waits on C, nobody is told. She finishes C: Ben is told B is ready, once.
select pg_temp.as_user('d0000000-0000-4000-8000-000000000002');
update public.tasks set status = 'done' where id = 'd0000000-0000-4000-b000-00000000000a';
reset role;
do $$ begin assert pg_temp.ready('d0000000-0000-4000-8000-000000000003') = 0, 'Ben was told too early'; end $$;
select pg_temp.as_user('d0000000-0000-4000-8000-000000000002');
update public.tasks set status = 'done' where id = 'd0000000-0000-4000-b000-00000000000c';
update public.tasks set title = 'TD API v2' where id = 'd0000000-0000-4000-b000-00000000000c'; -- editing a done task tells nobody again
reset role;
do $$ begin
  assert pg_temp.ready('d0000000-0000-4000-8000-000000000003') = 1, 'Ben wasn''t told once';
  assert (select link from public.notifications where user_id = 'd0000000-0000-4000-8000-000000000003' and title = 'Ready to start: TD UI')
         = '/student?team=d0000000-0000-4000-a000-000000000002&task=d0000000-0000-4000-b000-00000000000b', 'the link opens the task';
  assert (select body from public.notifications where user_id = 'd0000000-0000-4000-8000-000000000003' and title = 'Ready to start: TD UI') = 'TD API is done.', 'the note names the finished task';
end $$;
select pg_temp.ok('the waiting assignee is told when the last blocker is done');

-- 4. An archived course is read-only.
update public.courses set archived_at = now() where id = 'd0000000-0000-4000-a000-000000000001';
select pg_temp.as_user('d0000000-0000-4000-8000-000000000002');
do $$ begin
  delete from public.task_dependencies;
  raise exception 'unlinked in an archived course';
exception when raise_exception then
  if sqlerrm not like 'This course is archived%' then raise; end if;
end $$;
reset role;
select pg_temp.ok('archived courses are read-only');

rollback;
