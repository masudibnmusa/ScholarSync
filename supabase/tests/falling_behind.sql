-- Checks check_falling_behind() (0027) end to end on made-up people.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/falling_behind.sql
-- Everything happens in one transaction that is rolled back, so nothing is left behind.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name), now(), now(), '', '', '', ''
from (values ('fb000000-0000-4000-8000-000000000001', 'fb-teacher@test.invalid', 'FB Teacher'),
             ('fb000000-0000-4000-8000-000000000002', 'fb-ada@test.invalid', 'FB Ada'),
             ('fb000000-0000-4000-8000-000000000003', 'fb-ben@test.invalid', 'FB Ben'),
             ('fb000000-0000-4000-8000-000000000004', 'fb-cy@test.invalid', 'FB Cy')) v (id, email, name);
update public.users set role = 'instructor' where id = 'fb000000-0000-4000-8000-000000000001';

insert into public.courses (id, code, title, term, instructor_id)
values ('fb000000-0000-4000-a000-000000000001', 'FB-TEST', 'Falling behind test', 'Test', 'fb000000-0000-4000-8000-000000000001');
insert into public.teams (id, course_id, name) values ('fb000000-0000-4000-a000-000000000002', 'fb000000-0000-4000-a000-000000000001', 'FB Team');
insert into public.team_members (team_id, user_id, joined_at)
select 'fb000000-0000-4000-a000-000000000002', id::uuid, now() - interval '30 days'
from (values ('fb000000-0000-4000-8000-000000000002'), ('fb000000-0000-4000-8000-000000000003'), ('fb000000-0000-4000-8000-000000000004')) v (id);

-- Ada: 2 overdue tasks and quiet for 10 days (two signals). Ben: fine. Cy: 2 overdue tasks only (one signal).
insert into public.messages (team_id, sender_id, content, created_at) values
  ('fb000000-0000-4000-a000-000000000002', 'fb000000-0000-4000-8000-000000000002', 'hi all', now() - interval '10 days'),
  ('fb000000-0000-4000-a000-000000000002', 'fb000000-0000-4000-8000-000000000003', 'pushed the API', now() - interval '1 day'),
  ('fb000000-0000-4000-a000-000000000002', 'fb000000-0000-4000-8000-000000000004', 'reviewing it', now() - interval '1 day');
insert into public.tasks (team_id, title, assignee_id, due_date, status) values
  ('fb000000-0000-4000-a000-000000000002', 'Ada one', 'fb000000-0000-4000-8000-000000000002', current_date - 2, 'todo'),
  ('fb000000-0000-4000-a000-000000000002', 'Ada two', 'fb000000-0000-4000-8000-000000000002', current_date - 1, 'in_progress'),
  ('fb000000-0000-4000-a000-000000000002', 'Cy one', 'fb000000-0000-4000-8000-000000000004', current_date - 2, 'todo'),
  ('fb000000-0000-4000-a000-000000000002', 'Cy two', 'fb000000-0000-4000-8000-000000000004', current_date - 1, 'todo');

create temp table run_result (step text, nudged int, escalated int, resolved int);
create function pg_temp.run(step text) returns void language sql as
  $$ insert into run_result select step, * from public.check_falling_behind() $$;
create function pg_temp.expect(step text, n int, e int, r int) returns void language plpgsql as $$
declare got run_result;
begin
  select * into got from run_result where run_result.step = expect.step;
  if (got.nudged, got.escalated, got.resolved) is distinct from (n, e, r) then
    raise exception '%: expected nudged %, escalated %, resolved %; got %, %, %', step, n, e, r, got.nudged, got.escalated, got.resolved;
  end if;
  raise notice 'ok: %', step;
end $$;
create function pg_temp.notes(who text, title_like text) returns bigint language sql as
  $$ select count(*) from public.notifications n where n.user_id = who::uuid and n.title like title_like $$;

-- 1. Ada is nudged privately; Cy (one signal) and Ben are not; nobody tells the instructor yet.
select pg_temp.run('first day');
select pg_temp.expect('first day', 1, 0, 0);
do $$ begin
  assert pg_temp.notes('fb000000-0000-4000-8000-000000000002', 'A quick check-in on FB Team') = 1, 'Ada should get the check-in';
  assert (select body from public.notifications where user_id = 'fb000000-0000-4000-8000-000000000002' and title like 'A quick check-in%')
         like 'Noticed: 2 overdue tasks, no team chat for 10 days.%', 'the nudge should name both reasons';
  assert pg_temp.notes('fb000000-0000-4000-8000-000000000004', 'A quick check-in%') = 0, 'one signal is not enough';
  assert pg_temp.notes('fb000000-0000-4000-8000-000000000001', '%falling behind%') = 0, 'the instructor hears nothing yet';
end $$;

-- 2. Running again the same day sends nothing new.
select pg_temp.run('same day');
select pg_temp.expect('same day', 0, 0, 0);

-- 3. Still behind 3+ days after the nudge: the instructor is told, once.
update public.falling_behind set flagged_at = now() - interval '4 days';
select pg_temp.run('four days later');
select pg_temp.expect('four days later', 0, 1, 0);
select pg_temp.run('five days later');
select pg_temp.expect('five days later', 0, 0, 0);
do $$ begin
  assert pg_temp.notes('fb000000-0000-4000-8000-000000000001', 'FB Ada may be falling behind in FB Team') = 1, 'one instructor alert';
end $$;

-- 4. Ada finishes her tasks: the episode ends.
update public.tasks set status = 'done' where title like 'Ada%';
select pg_temp.run('caught up');
select pg_temp.expect('caught up', 0, 0, 1);

-- 5. Slips back within a week: the same episode continues, no second nudge.
update public.tasks set status = 'todo' where title like 'Ada%';
select pg_temp.run('slipped back');
select pg_temp.expect('slipped back', 0, 0, 0);
do $$ begin
  assert (select resolved_at is null and escalated_at is not null from public.falling_behind where user_id = 'fb000000-0000-4000-8000-000000000002'), 'episode reopened as it was';
end $$;

-- 6. Resolved more than a week ago, then behind again: a new episode with a new nudge.
update public.falling_behind set resolved_at = now() - interval '8 days';
select pg_temp.run('new episode');
select pg_temp.expect('new episode', 1, 0, 0);
do $$ begin
  assert pg_temp.notes('fb000000-0000-4000-8000-000000000002', 'A quick check-in%') = 2, 'a second nudge for a new episode';
end $$;

-- 7. Low peer scores count: Cy (overdue) now has two signals.
insert into public.peer_reviews (team_id, reviewer_id, reviewee_id, rating) values
  ('fb000000-0000-4000-a000-000000000002', 'fb000000-0000-4000-8000-000000000002', 'fb000000-0000-4000-8000-000000000004', 2),
  ('fb000000-0000-4000-a000-000000000002', 'fb000000-0000-4000-8000-000000000003', 'fb000000-0000-4000-8000-000000000004', 3);
select pg_temp.run('peer scores');
select pg_temp.expect('peer scores', 1, 0, 0);
do $$ begin
  assert (select body from public.notifications where user_id = 'fb000000-0000-4000-8000-000000000004' and title like 'A quick check-in%')
         = 'Noticed: 2 overdue tasks, low peer review scores. A short update to your team, or asking for help, goes a long way.', 'Cy''s nudge';
end $$;

-- 8. Archived courses are not checked: their open episodes end.
update public.courses set archived_at = now() where id = 'fb000000-0000-4000-a000-000000000001';
select pg_temp.run('archived');
select pg_temp.expect('archived', 0, 0, 2);

rollback;
