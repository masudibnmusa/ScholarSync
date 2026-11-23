-- Checks teaching assistants (0040): who can be one, what a TA sees and grades, and what stays the instructor's.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/teaching_assistants.sql
-- Everything happens in one transaction that is rolled back, so nothing is left behind.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name), now(), now(), '', '', '', ''
from (values ('7a000000-0000-4000-8000-000000000001', 'ta-teacher@test.invalid', 'TA Teacher'),
             ('7a000000-0000-4000-8000-000000000002', 'ta-ta@test.invalid', 'TA Tom'),
             ('7a000000-0000-4000-8000-000000000003', 'ta-ada@test.invalid', 'TA Ada'),
             ('7a000000-0000-4000-8000-000000000004', 'ta-other@test.invalid', 'TA Other staff')) v (id, email, name);
update public.users set role = 'instructor' where id in ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000004');
insert into public.courses (id, code, title, term, instructor_id) values
  ('7a000000-0000-4000-a000-000000000001', 'TA-TEST', 'TA test', 'Test', '7a000000-0000-4000-8000-000000000001'),
  ('7a000000-0000-4000-a000-000000000009', 'TA-ELSE', 'Not assisted', 'Test', '7a000000-0000-4000-8000-000000000001');
insert into public.course_enrollments (course_id, user_id) values
  ('7a000000-0000-4000-a000-000000000001', '7a000000-0000-4000-8000-000000000003'),
  ('7a000000-0000-4000-a000-000000000009', '7a000000-0000-4000-8000-000000000003');
insert into public.teams (id, course_id, name) values
  ('7a000000-0000-4000-a000-000000000002', '7a000000-0000-4000-a000-000000000001', 'TA Team'),
  ('7a000000-0000-4000-a000-000000000003', '7a000000-0000-4000-a000-000000000009', 'Elsewhere Team');
insert into public.team_members (team_id, user_id) values
  ('7a000000-0000-4000-a000-000000000002', '7a000000-0000-4000-8000-000000000003'),
  ('7a000000-0000-4000-a000-000000000003', '7a000000-0000-4000-8000-000000000003');
insert into public.tasks (team_id, title) values ('7a000000-0000-4000-a000-000000000002', 'TA visible task'), ('7a000000-0000-4000-a000-000000000003', 'TA hidden task');
insert into public.rubric_criteria (id, course_id, name, max_points) values ('7a000000-0000-4000-c000-000000000001', '7a000000-0000-4000-a000-000000000001', 'Code', 50);
insert into public.course_milestones (id, course_id, title, due_date, requires_submission)
values ('7a000000-0000-4000-b000-000000000001', '7a000000-0000-4000-a000-000000000001', 'TA report', current_date + 5, true);
insert into public.submissions (team_id, milestone_id, link, submitted_by)
values ('7a000000-0000-4000-a000-000000000002', '7a000000-0000-4000-b000-000000000001', 'https://example.com/report', '7a000000-0000-4000-8000-000000000003');
insert into public.deadline_extensions (team_id, milestone_id, new_date, reason, requested_by)
values ('7a000000-0000-4000-a000-000000000002', '7a000000-0000-4000-b000-000000000001', current_date + 9, 'Sick', '7a000000-0000-4000-8000-000000000003');

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true)
$$;
create function pg_temp.ok(what text) returns void language plpgsql as $$ begin raise notice 'ok: %', what; end $$;
create function pg_temp.fails(stmt text, what text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception '%', what;
exception when insufficient_privilege or raise_exception then
  if sqlerrm = what then raise; end if;
end $$;

-- 1. Only the instructor adds TAs, only staff accounts, not themself; the TA is told.
select pg_temp.as_user('7a000000-0000-4000-8000-000000000004');
select pg_temp.fails($$insert into public.course_tas (course_id, user_id) values ('7a000000-0000-4000-a000-000000000001', '7a000000-0000-4000-8000-000000000004')$$, 'other staff made themself a TA');
select pg_temp.as_user('7a000000-0000-4000-8000-000000000001');
select pg_temp.fails($$insert into public.course_tas (course_id, user_id) values ('7a000000-0000-4000-a000-000000000001', '7a000000-0000-4000-8000-000000000003')$$, 'a student became a TA');
select pg_temp.fails($$insert into public.course_tas (course_id, user_id) values ('7a000000-0000-4000-a000-000000000001', '7a000000-0000-4000-8000-000000000001')$$, 'the instructor became their own TA');
insert into public.course_tas (course_id, user_id) values ('7a000000-0000-4000-a000-000000000001', '7a000000-0000-4000-8000-000000000002');
reset role;
do $$ begin
  assert (select count(*) from public.notifications where user_id = '7a000000-0000-4000-8000-000000000002' and title = 'You are a teaching assistant for TA-TEST') = 1, 'the TA wasn''t told';
end $$;
select pg_temp.ok('only the instructor adds staff as TAs');

-- 2. The TA sees the assisted course's teams, work, roster and names; not other courses.
select pg_temp.as_user('7a000000-0000-4000-8000-000000000002');
do $$ begin
  assert (select count(*) from public.teams) = 1, 'the TA sees the wrong teams';
  assert (select count(*) from public.tasks) = 1 and (select title from public.tasks) = 'TA visible task', 'the TA sees the wrong tasks';
  assert (select count(*) from public.course_enrollments) = 1, 'the TA doesn''t see the roster';
  assert (select count(*) from public.submissions) = 1, 'the TA doesn''t see hand-ins';
  assert (select name from public.users where id = '7a000000-0000-4000-8000-000000000003') = 'TA Ada', 'the TA can''t see the student''s name';
end $$;
reset role;
select pg_temp.ok('the TA sees the course''s teams and nothing else');

-- 3. The TA grades: team marks, factors and hand-in feedback, without touching the hand-in itself.
select pg_temp.as_user('7a000000-0000-4000-8000-000000000002');
insert into public.team_grades (team_id, criterion_id, points) values ('7a000000-0000-4000-a000-000000000002', '7a000000-0000-4000-c000-000000000001', 40);
insert into public.student_grade_factors (team_id, user_id, factor) values ('7a000000-0000-4000-a000-000000000002', '7a000000-0000-4000-8000-000000000003', 0.9);
update public.submissions set feedback = 'Good start', link = 'https://evil.example' where team_id = '7a000000-0000-4000-a000-000000000002';
reset role;
do $$ begin
  assert (select points from public.team_grades where team_id = '7a000000-0000-4000-a000-000000000002') = 40, 'the TA couldn''t grade';
  assert (select feedback from public.submissions where team_id = '7a000000-0000-4000-a000-000000000002') = 'Good start', 'the TA couldn''t give feedback';
  assert (select link from public.submissions where team_id = '7a000000-0000-4000-a000-000000000002') = 'https://example.com/report', 'the TA changed the hand-in';
  assert (select feedback_by from public.submissions where team_id = '7a000000-0000-4000-a000-000000000002') = '7a000000-0000-4000-8000-000000000002', 'feedback isn''t stamped with the TA';
end $$;
select pg_temp.ok('the TA grades');

-- 4. What stays the instructor's: the course, roster, teams, rubric, milestones, announcements, releasing grades, extensions.
select pg_temp.as_user('7a000000-0000-4000-8000-000000000002');
update public.courses set title = 'hijacked', grades_released = true where id = '7a000000-0000-4000-a000-000000000001';
delete from public.courses where id = '7a000000-0000-4000-a000-000000000001';
delete from public.course_enrollments;
delete from public.team_members;
delete from public.rubric_criteria;
delete from public.course_milestones;
select pg_temp.fails($$insert into public.course_announcements (course_id, author_id, title) values ('7a000000-0000-4000-a000-000000000001', '7a000000-0000-4000-8000-000000000002', 'x')$$, 'the TA posted an announcement');
select pg_temp.fails($$insert into public.course_tas (course_id, user_id) values ('7a000000-0000-4000-a000-000000000001', '7a000000-0000-4000-8000-000000000004')$$, 'the TA added a TA');
select pg_temp.fails($$update public.deadline_extensions set status = 'approved' where team_id = '7a000000-0000-4000-a000-000000000002'$$, 'the TA decided an extension');
select pg_temp.fails($$update public.deadline_extensions set new_date = current_date + 30 where team_id = '7a000000-0000-4000-a000-000000000002'$$, 'the TA changed a team''s request');
reset role;
do $$ begin
  assert (select title from public.courses where id = '7a000000-0000-4000-a000-000000000001') = 'TA test', 'the TA edited or deleted the course';
  assert not (select grades_released from public.courses where id = '7a000000-0000-4000-a000-000000000001'), 'the TA released grades';
  assert (select count(*) from public.course_enrollments where user_id = '7a000000-0000-4000-8000-000000000003') = 2
     and (select count(*) from public.team_members where user_id = '7a000000-0000-4000-8000-000000000003') = 2, 'the TA changed the roster or a team';
  assert (select count(*) from public.rubric_criteria where course_id = '7a000000-0000-4000-a000-000000000001') = 1
     and (select count(*) from public.course_milestones where course_id = '7a000000-0000-4000-a000-000000000001') = 1, 'the TA changed the rubric or milestones';
  assert (select status from public.deadline_extensions where team_id = '7a000000-0000-4000-a000-000000000002') = 'pending', 'the extension changed';
end $$;
select pg_temp.ok('the course stays the instructor''s');

-- 5. Removing the TA ends access.
select pg_temp.as_user('7a000000-0000-4000-8000-000000000001');
delete from public.course_tas where user_id = '7a000000-0000-4000-8000-000000000002';
select pg_temp.as_user('7a000000-0000-4000-8000-000000000002');
do $$ begin assert (select count(*) from public.teams) = 0, 'a removed TA still sees teams'; end $$;
reset role;
select pg_temp.ok('removing the TA ends access');

rollback;
