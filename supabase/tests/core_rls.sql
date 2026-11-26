-- Checks the core access rules (0001 onward): a team's chat, tasks and files stay inside the team and its course staff,
-- peer reviews are read by their writer and staff only, and grades stay hidden from students until released.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/core_rls.sql
-- Everything happens in one transaction that is rolled back, so nothing is left behind.
begin;

-- Teacher teaches the course; Ada and Ben are team A, Cy is team B in the same course, Dee is in no course.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name), now(), now(), '', '', '', ''
from (values ('c0e00000-0000-4000-8000-000000000001', 'cr-teacher@test.invalid', 'CR Teacher'),
             ('c0e00000-0000-4000-8000-000000000002', 'cr-ada@test.invalid', 'CR Ada'),
             ('c0e00000-0000-4000-8000-000000000003', 'cr-ben@test.invalid', 'CR Ben'),
             ('c0e00000-0000-4000-8000-000000000004', 'cr-cy@test.invalid', 'CR Cy'),
             ('c0e00000-0000-4000-8000-000000000005', 'cr-dee@test.invalid', 'CR Dee')) v (id, email, name);
update public.users set role = 'instructor' where id = 'c0e00000-0000-4000-8000-000000000001';
insert into public.courses (id, code, title, term, instructor_id)
values ('c0e00000-0000-4000-a000-000000000001', 'CR-TEST', 'Core rules', 'Test', 'c0e00000-0000-4000-8000-000000000001');
insert into public.course_enrollments (course_id, user_id)
select 'c0e00000-0000-4000-a000-000000000001', id::uuid
from (values ('c0e00000-0000-4000-8000-000000000002'), ('c0e00000-0000-4000-8000-000000000003'), ('c0e00000-0000-4000-8000-000000000004')) v (id);
insert into public.teams (id, course_id, name) values
  ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-a000-000000000001', 'CR Team A'),
  ('c0e00000-0000-4000-a000-00000000000b', 'c0e00000-0000-4000-a000-000000000001', 'CR Team B');
insert into public.team_members (team_id, user_id) values
  ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-8000-000000000002'),
  ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-8000-000000000003'),
  ('c0e00000-0000-4000-a000-00000000000b', 'c0e00000-0000-4000-8000-000000000004');
insert into public.messages (team_id, sender_id, content)
values ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-8000-000000000002', 'CR secret plan');
insert into public.tasks (id, team_id, title)
values ('c0e00000-0000-4000-b000-000000000001', 'c0e00000-0000-4000-a000-00000000000a', 'CR task');
insert into public.files (team_id, uploader_id, name, storage_path, size_bytes, mime_type)
values ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-8000-000000000002', 'cr.txt', 'c0e00000-0000-4000-a000-00000000000a/cr.txt', 3, 'text/plain');
-- Ada reviews Ben.
insert into public.peer_reviews (team_id, reviewer_id, reviewee_id, rating, feedback)
values ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-8000-000000000002', 'c0e00000-0000-4000-8000-000000000003', 2, 'CR honest');
insert into public.rubric_criteria (id, course_id, name, max_points)
values ('c0e00000-0000-4000-c000-000000000001', 'c0e00000-0000-4000-a000-000000000001', 'CR quality', 10);
insert into public.team_grades (team_id, criterion_id, points)
values ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-c000-000000000001', 8);
insert into public.student_grade_factors (team_id, user_id, factor) values
  ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-8000-000000000002', 1.1),
  ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-8000-000000000003', 0.9);

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true)
$$;
-- How many of team A's rows the current user sees in each table, as "messages/tasks/files".
create function pg_temp.team_a() returns text language sql as $$
  select concat_ws('/',
    (select count(*) from public.messages where team_id = 'c0e00000-0000-4000-a000-00000000000a'),
    (select count(*) from public.tasks where team_id = 'c0e00000-0000-4000-a000-00000000000a'),
    (select count(*) from public.files where team_id = 'c0e00000-0000-4000-a000-00000000000a'))
$$;
create function pg_temp.expect(got text, want text, what text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception '%: got [%], want [%]', what, got, want; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.refused(stmt text, what text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception '%', what;
exception when insufficient_privilege then null; -- refused by RLS, as it should be
end $$;

-- 1. Team A's chat, tasks and files: members and the instructor read them; another team and outsiders don't.
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000003');
select pg_temp.expect(pg_temp.team_a(), '1/1/1', 'a member reads the team''s chat, tasks and files');
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000001');
select pg_temp.expect(pg_temp.team_a(), '1/1/1', 'the instructor reads them');
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000004');
select pg_temp.expect(pg_temp.team_a(), '0/0/0', 'another team in the course reads nothing');
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000005');
select pg_temp.expect(pg_temp.team_a(), '0/0/0', 'an outsider reads nothing');

-- 2. Another team can't write into team A, nor change or delete its tasks.
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000004');
select pg_temp.refused($$insert into public.messages (team_id, content) values ('c0e00000-0000-4000-a000-00000000000a', 'CR intruder')$$,
                       'another team posted in team A''s chat');
select pg_temp.refused($$insert into public.tasks (team_id, title) values ('c0e00000-0000-4000-a000-00000000000a', 'CR intruder')$$,
                       'another team added a task to team A');
update public.tasks set title = 'CR hijacked' where id = 'c0e00000-0000-4000-b000-000000000001';
delete from public.tasks where id = 'c0e00000-0000-4000-b000-000000000001';
reset role;
select pg_temp.expect((select title from public.tasks where id = 'c0e00000-0000-4000-b000-000000000001'), 'CR task',
                      'another team can''t change or delete team A''s task');

-- 3. Nobody posts as someone else.
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000003');
select pg_temp.refused($$insert into public.messages (team_id, sender_id, content)
                         values ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-8000-000000000002', 'CR forged')$$,
                       'Ben posted as Ada');

-- 4. Peer reviews: the writer and staff read them; the person reviewed and others don't.
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000002');
select pg_temp.expect((select count(*) from public.peer_reviews where team_id = 'c0e00000-0000-4000-a000-00000000000a')::text, '1', 'the reviewer reads their review');
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000001');
select pg_temp.expect((select count(*) from public.peer_reviews where team_id = 'c0e00000-0000-4000-a000-00000000000a')::text, '1', 'the instructor reads it');
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000003');
select pg_temp.expect((select count(*) from public.peer_reviews where team_id = 'c0e00000-0000-4000-a000-00000000000a')::text, '0', 'the person reviewed doesn''t');
select pg_temp.refused($$insert into public.peer_reviews (team_id, reviewer_id, reviewee_id, rating, feedback)
                         values ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-8000-000000000002', 'c0e00000-0000-4000-8000-000000000003', 5, 'CR forged')$$,
                       'Ben wrote a review as Ada');
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000004');
select pg_temp.refused($$insert into public.peer_reviews (team_id, reviewee_id, rating, feedback)
                         values ('c0e00000-0000-4000-a000-00000000000a', 'c0e00000-0000-4000-8000-000000000003', 1, 'CR outsider')$$,
                       'another team reviewed a team A member');

-- 5. Grades: hidden from students until released, then each student sees the team grade and only their own factor.
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000002');
select pg_temp.expect(concat_ws('/', (select count(*) from public.team_grades), (select count(*) from public.student_grade_factors)), '0/0',
                      'students see no grades before release');
select pg_temp.refused($$insert into public.team_grades (team_id, criterion_id, points)
                         values ('c0e00000-0000-4000-a000-00000000000b', 'c0e00000-0000-4000-c000-000000000001', 10)$$,
                       'a student graded a team');
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000001');
update public.courses set grades_released = true where id = 'c0e00000-0000-4000-a000-000000000001';
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000002');
select pg_temp.expect(concat_ws('/', (select count(*) from public.team_grades), (select string_agg(factor::text, ',') from public.student_grade_factors)), '1/1.10',
                      'after release Ada sees the team grade and only her own factor');
update public.student_grade_factors set factor = 1.15 where user_id = 'c0e00000-0000-4000-8000-000000000002';
select pg_temp.as_user('c0e00000-0000-4000-8000-000000000004');
select pg_temp.expect((select count(*) from public.team_grades)::text, '0', 'another team doesn''t see team A''s grade');
reset role;
select pg_temp.expect((select factor::text from public.student_grade_factors where user_id = 'c0e00000-0000-4000-8000-000000000002'), '1.10',
                      'a student can''t raise their own factor');

\echo 'core_rls: all checks passed'
rollback;
