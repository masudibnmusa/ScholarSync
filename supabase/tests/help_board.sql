-- Checks the peer help board (0035): who may read, ask, answer, mark the solution and delete; the notifications.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/help_board.sql
-- Everything happens in one transaction that is rolled back, so nothing is left behind.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name), now(), now(), '', '', '', ''
from (values ('4b000000-0000-4000-8000-000000000001', 'hb-teacher@test.invalid', 'HB Teacher'),
             ('4b000000-0000-4000-8000-000000000002', 'hb-ada@test.invalid', 'HB Ada'),
             ('4b000000-0000-4000-8000-000000000003', 'hb-ben@test.invalid', 'HB Ben'),
             ('4b000000-0000-4000-8000-000000000004', 'hb-out@test.invalid', 'HB Outsider')) v (id, email, name);
update public.users set role = 'instructor' where id = '4b000000-0000-4000-8000-000000000001';
insert into public.courses (id, code, title, term, instructor_id)
values ('4b000000-0000-4000-a000-000000000001', 'HB-TEST', 'Help test', 'Test', '4b000000-0000-4000-8000-000000000001');
insert into public.course_enrollments (course_id, user_id) values
  ('4b000000-0000-4000-a000-000000000001', '4b000000-0000-4000-8000-000000000002'),
  ('4b000000-0000-4000-a000-000000000001', '4b000000-0000-4000-8000-000000000003');

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true)
$$;
create function pg_temp.ok(what text) returns void language plpgsql as $$ begin raise notice 'ok: %', what; end $$;

-- 1. Ada asks; Ben answers twice; the teacher answers too. Ada is told about Ben's and the teacher's answers.
select pg_temp.as_user('4b000000-0000-4000-8000-000000000002');
insert into public.help_questions (id, course_id, title) values ('4b000000-0000-4000-b000-000000000001', '4b000000-0000-4000-a000-000000000001', 'How do I seed?');
insert into public.help_questions (id, course_id, title) values ('4b000000-0000-4000-b000-000000000002', '4b000000-0000-4000-a000-000000000001', 'Another one');
select pg_temp.as_user('4b000000-0000-4000-8000-000000000003');
insert into public.help_answers (id, question_id, body) values ('4b000000-0000-4000-c000-000000000001', '4b000000-0000-4000-b000-000000000001', 'Start Supabase first');
insert into public.help_answers (id, question_id, body) values ('4b000000-0000-4000-c000-000000000002', '4b000000-0000-4000-b000-000000000002', 'Other answer');
select pg_temp.as_user('4b000000-0000-4000-8000-000000000001');
insert into public.help_answers (question_id, body) values ('4b000000-0000-4000-b000-000000000001', 'Teacher here');
reset role;
do $$ begin
  assert (select count(*) from public.notifications where user_id = '4b000000-0000-4000-8000-000000000002' and title = 'HB Ben answered your question: How do I seed?') = 1, 'Ada is told about Ben''s answer';
  assert (select link from public.notifications where user_id = '4b000000-0000-4000-8000-000000000002' and title like 'HB Teacher answered%')
         = '/student/courses/4b000000-0000-4000-a000-000000000001?help=4b000000-0000-4000-b000-000000000001', 'the link opens the question';
end $$;
select pg_temp.ok('asking and answering, with notifications');

-- 2. Someone outside the course sees nothing and can't ask or answer.
select pg_temp.as_user('4b000000-0000-4000-8000-000000000004');
do $$ begin
  assert (select count(*) from public.help_questions) = 0, 'an outsider sees questions';
  assert (select count(*) from public.help_answers) = 0, 'an outsider sees answers';
  begin
    insert into public.help_answers (question_id, body) values ('4b000000-0000-4000-b000-000000000001', 'sneaky');
    raise exception 'an outsider answered';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select pg_temp.ok('outsiders see and post nothing');

-- 3. Only the asker marks the solution, and only with an answer to that question. Ben (the helper) is told.
select pg_temp.as_user('4b000000-0000-4000-8000-000000000003');
update public.help_questions set solved_by = '4b000000-0000-4000-c000-000000000001' where id = '4b000000-0000-4000-b000-000000000001';
reset role;
do $$ begin
  assert (select solved_by from public.help_questions where id = '4b000000-0000-4000-b000-000000000001') is null, 'Ben marked his own answer as the solution';
end $$;
select pg_temp.as_user('4b000000-0000-4000-8000-000000000002');
do $$ begin
  update public.help_questions set solved_by = '4b000000-0000-4000-c000-000000000002' where id = '4b000000-0000-4000-b000-000000000001';
  raise exception 'an answer to another question was accepted';
exception when raise_exception then
  if sqlerrm not like 'That answer belongs to another question%' then raise; end if;
end $$;
do $$ begin
  update public.help_questions set title = 'renamed' where id = '4b000000-0000-4000-b000-000000000001';
  raise exception 'the asker changed the title through the solution update';
exception when insufficient_privilege then null;
end $$;
update public.help_questions set solved_by = '4b000000-0000-4000-c000-000000000001' where id = '4b000000-0000-4000-b000-000000000001';
reset role;
do $$ begin
  assert (select count(*) from public.notifications where user_id = '4b000000-0000-4000-8000-000000000003' and title = 'Your answer solved a question: How do I seed?') = 1, 'Ben is told';
end $$;
select pg_temp.ok('only the asker marks a solution, from that question''s answers');

-- 4. Ben can't delete Ada's question; the instructor can (moderation), and its answers go with it.
select pg_temp.as_user('4b000000-0000-4000-8000-000000000003');
delete from public.help_questions where id = '4b000000-0000-4000-b000-000000000002';
select pg_temp.as_user('4b000000-0000-4000-8000-000000000001');
do $$ begin assert (select count(*) from public.help_questions where id = '4b000000-0000-4000-b000-000000000002') = 1, 'Ben deleted Ada''s question'; end $$;
delete from public.help_questions where id = '4b000000-0000-4000-b000-000000000002';
reset role;
do $$ begin
  assert (select count(*) from public.help_questions where id = '4b000000-0000-4000-b000-000000000002') = 0, 'the instructor could not remove it';
  assert (select count(*) from public.help_answers where id = '4b000000-0000-4000-c000-000000000002') = 0, 'its answers stayed';
end $$;
select pg_temp.ok('the instructor moderates');

-- 5. An archived course is read-only.
update public.courses set archived_at = now() where id = '4b000000-0000-4000-a000-000000000001';
select pg_temp.as_user('4b000000-0000-4000-8000-000000000002');
do $$ begin
  insert into public.help_questions (course_id, title) values ('4b000000-0000-4000-a000-000000000001', 'too late');
  raise exception 'asked in an archived course';
exception when raise_exception then
  if sqlerrm not like 'This course is archived%' then raise; end if;
end $$;
reset role;
select pg_temp.ok('archived courses are read-only');

rollback;
