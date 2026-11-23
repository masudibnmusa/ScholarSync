-- Checks the rubric checklist (0037): who may tick and untick, only this course's criteria and milestones, the archive lock.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/rubric_checks.sql
-- Everything happens in one transaction that is rolled back, so nothing is left behind.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name), now(), now(), '', '', '', ''
from (values ('7c000000-0000-4000-8000-000000000001', 'rc-teacher@test.invalid', 'RC Teacher'),
             ('7c000000-0000-4000-8000-000000000002', 'rc-ada@test.invalid', 'RC Ada'),
             ('7c000000-0000-4000-8000-000000000003', 'rc-ben@test.invalid', 'RC Ben'),
             ('7c000000-0000-4000-8000-000000000004', 'rc-out@test.invalid', 'RC Other team')) v (id, email, name);
update public.users set role = 'instructor' where id = '7c000000-0000-4000-8000-000000000001';
insert into public.courses (id, code, title, term, instructor_id) values
  ('7c000000-0000-4000-a000-000000000001', 'RC-TEST', 'Rubric test', 'Test', '7c000000-0000-4000-8000-000000000001'),
  ('7c000000-0000-4000-a000-000000000009', 'RC-ELSE', 'Another course', 'Test', '7c000000-0000-4000-8000-000000000001');
insert into public.course_enrollments (course_id, user_id) values
  ('7c000000-0000-4000-a000-000000000001', '7c000000-0000-4000-8000-000000000002'),
  ('7c000000-0000-4000-a000-000000000001', '7c000000-0000-4000-8000-000000000003'),
  ('7c000000-0000-4000-a000-000000000001', '7c000000-0000-4000-8000-000000000004');
insert into public.teams (id, course_id, name) values
  ('7c000000-0000-4000-a000-000000000002', '7c000000-0000-4000-a000-000000000001', 'RC Team'),
  ('7c000000-0000-4000-a000-000000000003', '7c000000-0000-4000-a000-000000000001', 'RC Other');
insert into public.team_members (team_id, user_id) values
  ('7c000000-0000-4000-a000-000000000002', '7c000000-0000-4000-8000-000000000002'),
  ('7c000000-0000-4000-a000-000000000002', '7c000000-0000-4000-8000-000000000003'),
  ('7c000000-0000-4000-a000-000000000003', '7c000000-0000-4000-8000-000000000004');
insert into public.course_milestones (id, course_id, title, due_date, requires_submission) values
  ('7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-a000-000000000001', 'RC Report', current_date + 7, true),
  ('7c000000-0000-4000-b000-000000000009', '7c000000-0000-4000-a000-000000000009', 'Elsewhere', current_date + 7, true);
insert into public.rubric_criteria (id, course_id, name, max_points) values
  ('7c000000-0000-4000-c000-000000000001', '7c000000-0000-4000-a000-000000000001', 'Clarity', 10),
  ('7c000000-0000-4000-c000-000000000002', '7c000000-0000-4000-a000-000000000001', 'Testing', 10),
  ('7c000000-0000-4000-c000-000000000009', '7c000000-0000-4000-a000-000000000009', 'Not this course', 10);

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true)
$$;
create function pg_temp.ok(what text) returns void language plpgsql as $$ begin raise notice 'ok: %', what; end $$;
create function pg_temp.refused(stmt text, what text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception '%', what;
exception when insufficient_privilege or foreign_key_violation then null;
end $$;

-- 1. Ada ticks a criterion; Ben sees it and can untick it; the instructor sees it.
select pg_temp.as_user('7c000000-0000-4000-8000-000000000002');
insert into public.rubric_checks (team_id, milestone_id, criterion_id)
values ('7c000000-0000-4000-a000-000000000002', '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-c000-000000000001'),
       ('7c000000-0000-4000-a000-000000000002', '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-c000-000000000002');
select pg_temp.as_user('7c000000-0000-4000-8000-000000000003');
do $$ begin assert (select count(*) from public.rubric_checks) = 2, 'Ben doesn''t see the ticks'; end $$;
delete from public.rubric_checks where criterion_id = '7c000000-0000-4000-c000-000000000002';
select pg_temp.as_user('7c000000-0000-4000-8000-000000000001');
do $$ begin
  assert (select count(*) from public.rubric_checks) = 1, 'the instructor doesn''t see one tick';
  assert (select checked_by from public.rubric_checks) = '7c000000-0000-4000-8000-000000000002', 'the tick records who made it';
end $$;
reset role;
select pg_temp.ok('the team ticks and unticks, the instructor sees it');

-- 2. Another team sees nothing, can't tick for this team, and can't untick.
select pg_temp.as_user('7c000000-0000-4000-8000-000000000004');
do $$ begin assert (select count(*) from public.rubric_checks) = 0, 'another team sees the ticks'; end $$;
select pg_temp.refused($$insert into public.rubric_checks (team_id, milestone_id, criterion_id)
  values ('7c000000-0000-4000-a000-000000000002', '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-c000-000000000002')$$, 'another team ticked');
delete from public.rubric_checks;
reset role;
do $$ begin assert (select count(*) from public.rubric_checks) = 1, 'another team unticked'; end $$;
-- The instructor reads but doesn't tick.
select pg_temp.as_user('7c000000-0000-4000-8000-000000000001');
select pg_temp.refused($$insert into public.rubric_checks (team_id, milestone_id, criterion_id)
  values ('7c000000-0000-4000-a000-000000000002', '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-c000-000000000002')$$, 'the instructor ticked');
reset role;
select pg_temp.ok('only the team ticks');

-- 3. Only this course's criteria and milestones, and only as yourself.
select pg_temp.as_user('7c000000-0000-4000-8000-000000000002');
select pg_temp.refused($$insert into public.rubric_checks (team_id, milestone_id, criterion_id)
  values ('7c000000-0000-4000-a000-000000000002', '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-c000-000000000009')$$, 'another course''s criterion');
select pg_temp.refused($$insert into public.rubric_checks (team_id, milestone_id, criterion_id)
  values ('7c000000-0000-4000-a000-000000000002', '7c000000-0000-4000-b000-000000000009', '7c000000-0000-4000-c000-000000000002')$$, 'another course''s milestone');
select pg_temp.refused($$insert into public.rubric_checks (team_id, milestone_id, criterion_id, checked_by)
  values ('7c000000-0000-4000-a000-000000000002', '7c000000-0000-4000-b000-000000000001', '7c000000-0000-4000-c000-000000000002', '7c000000-0000-4000-8000-000000000003')$$, 'ticked as someone else');
reset role;
select pg_temp.ok('only this course''s criteria and milestones');

-- 4. An archived course is read-only.
update public.courses set archived_at = now() where id = '7c000000-0000-4000-a000-000000000001';
select pg_temp.as_user('7c000000-0000-4000-8000-000000000002');
do $$ begin
  delete from public.rubric_checks;
  raise exception 'unticked in an archived course';
exception when raise_exception then
  if sqlerrm not like 'This course is archived%' then raise; end if;
end $$;
reset role;
select pg_temp.ok('archived courses are read-only');

rollback;
