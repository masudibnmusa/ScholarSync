-- Checks deadline extensions (0034): who may ask, decide and change what, the notifications, and the risk alerts.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/deadline_extensions.sql
-- Everything happens in one transaction that is rolled back, so nothing is left behind.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name), now(), now(), '', '', '', ''
from (values ('de000000-0000-4000-8000-000000000001', 'de-teacher@test.invalid', 'DE Teacher'),
             ('de000000-0000-4000-8000-000000000002', 'de-ada@test.invalid', 'DE Ada'),
             ('de000000-0000-4000-8000-000000000003', 'de-ben@test.invalid', 'DE Ben'),
             ('de000000-0000-4000-8000-000000000004', 'de-out@test.invalid', 'DE Outsider')) v (id, email, name);
update public.users set role = 'instructor' where id = 'de000000-0000-4000-8000-000000000001';

insert into public.courses (id, code, title, term, instructor_id)
values ('de000000-0000-4000-a000-000000000001', 'DE-TEST', 'Extension test', 'Test', 'de000000-0000-4000-8000-000000000001');
insert into public.course_enrollments (course_id, user_id)
select 'de000000-0000-4000-a000-000000000001', id::uuid
from (values ('de000000-0000-4000-8000-000000000002'), ('de000000-0000-4000-8000-000000000003'), ('de000000-0000-4000-8000-000000000004')) v (id);
insert into public.teams (id, course_id, name) values ('de000000-0000-4000-a000-000000000002', 'de000000-0000-4000-a000-000000000001', 'DE Team');
insert into public.team_members (team_id, user_id) values
  ('de000000-0000-4000-a000-000000000002', 'de000000-0000-4000-8000-000000000002'),
  ('de000000-0000-4000-a000-000000000002', 'de000000-0000-4000-8000-000000000003');
insert into public.course_milestones (id, course_id, title, due_date)
values ('de000000-0000-4000-b000-000000000001', 'de000000-0000-4000-a000-000000000001', 'DE Proposal', current_date + 3);

-- Act as a signed-in user, the way withUser() does.
create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true)
$$;
create function pg_temp.ext() returns public.deadline_extensions language sql as
  $$ select * from public.deadline_extensions where team_id = 'de000000-0000-4000-a000-000000000002' $$;
create function pg_temp.notes(who text, title_like text) returns bigint language sql as
  $$ select count(*) from public.notifications n where n.user_id = who::uuid and n.title like title_like $$;
create function pg_temp.ok(what text) returns void language plpgsql as $$ begin raise notice 'ok: %', what; end $$;

-- 1. Someone outside the team can't ask for it.
select pg_temp.as_user('de000000-0000-4000-8000-000000000004');
do $$ begin
  insert into public.deadline_extensions (team_id, milestone_id, new_date, reason)
  values ('de000000-0000-4000-a000-000000000002', 'de000000-0000-4000-b000-000000000001', current_date + 7, 'not my team');
  raise exception 'an outsider asked for more time';
exception when insufficient_privilege then null;
end $$;
reset role;
select pg_temp.ok('an outsider cannot ask');

-- 2. A teammate can't ask for a date on or before the current due date.
select pg_temp.as_user('de000000-0000-4000-8000-000000000002');
do $$ begin
  insert into public.deadline_extensions (team_id, milestone_id, new_date, reason)
  values ('de000000-0000-4000-a000-000000000002', 'de000000-0000-4000-b000-000000000001', current_date + 3, 'same day');
  raise exception 'a date that is not later was accepted';
exception when raise_exception then
  if sqlerrm not like 'Pick a date after%' then raise; end if;
end $$;
select pg_temp.ok('the new date must be later');

-- 3. A valid request is pending, and the instructor is told with the date and the reason.
insert into public.deadline_extensions (team_id, milestone_id, new_date, reason, status, approved_date)
values ('de000000-0000-4000-a000-000000000002', 'de000000-0000-4000-b000-000000000001', current_date + 7, 'User tests moved', 'approved', current_date + 30);
reset role;
do $$ begin
  assert (pg_temp.ext()).status = 'pending', 'a new request is pending, whatever the team sends';
  assert (pg_temp.ext()).approved_date is null, 'the team cannot set its own due date';
  assert (pg_temp.ext()).requested_by = 'de000000-0000-4000-8000-000000000002', 'the request records who asked';
  assert pg_temp.notes('de000000-0000-4000-8000-000000000001', 'DE Team asks for more time on DE Proposal') = 1, 'the instructor is told';
  assert (select body from public.notifications where user_id = 'de000000-0000-4000-8000-000000000001' and title like 'DE Team asks%')
         = 'Until ' || to_char(current_date + 7, 'Dy DD Mon') || ': User tests moved', 'the note has the date and the reason';
end $$;
select pg_temp.ok('a request is pending and the instructor is told');

-- 4. The team can't approve its own request.
select pg_temp.as_user('de000000-0000-4000-8000-000000000003');
update public.deadline_extensions set status = 'approved', approved_date = current_date + 30 where team_id = 'de000000-0000-4000-a000-000000000002';
reset role;
do $$ begin
  assert (pg_temp.ext()).status = 'pending' and (pg_temp.ext()).approved_date is null, 'the team approved its own request';
end $$;
select pg_temp.ok('the team cannot approve');

-- 5. The instructor approves: the date asked for becomes the team's due date, the reason can't be changed, the team is told.
select pg_temp.as_user('de000000-0000-4000-8000-000000000001');
update public.deadline_extensions set status = 'approved', reason = 'changed', new_date = current_date + 60, approved_date = current_date + 90
where team_id = 'de000000-0000-4000-a000-000000000002';
reset role;
do $$ begin
  assert (pg_temp.ext()).approved_date = current_date + 7, 'the approved date is the one asked for';
  assert (pg_temp.ext()).reason = 'User tests moved' and (pg_temp.ext()).new_date = current_date + 7, 'the instructor changed the request';
  assert (pg_temp.ext()).decided_by = 'de000000-0000-4000-8000-000000000001', 'the decision records who made it';
  assert pg_temp.notes('de000000-0000-4000-8000-000000000002', 'More time on DE Proposal: due ' || to_char(current_date + 7, 'Dy DD Mon')) = 1, 'Ada is told';
  assert pg_temp.notes('de000000-0000-4000-8000-000000000003', 'More time on DE Proposal: due %') = 1, 'Ben is told';
end $$;
select pg_temp.ok('approving moves the team''s due date');

-- 6. A decided request can't be decided again.
select pg_temp.as_user('de000000-0000-4000-8000-000000000001');
do $$ begin
  update public.deadline_extensions set status = 'declined' where team_id = 'de000000-0000-4000-a000-000000000002';
  raise exception 'a decided request was decided again';
exception when raise_exception then
  if sqlerrm not like 'Only a pending request%' then raise; end if;
end $$;
reset role;
select pg_temp.ok('a decision is final until the team asks again');

-- 7. Asking again keeps the approved date until the new request is decided; a decline keeps it too.
select pg_temp.as_user('de000000-0000-4000-8000-000000000002');
do $$ begin
  update public.deadline_extensions set new_date = current_date + 7 where team_id = 'de000000-0000-4000-a000-000000000002';
  raise exception 'asking again for the approved date was accepted';
exception when raise_exception then
  if sqlerrm not like 'Pick a date after%' then raise; end if;
end $$;
update public.deadline_extensions set new_date = current_date + 10, reason = 'Still blocked' where team_id = 'de000000-0000-4000-a000-000000000002';
reset role;
do $$ begin
  assert (pg_temp.ext()).status = 'pending' and (pg_temp.ext()).approved_date = current_date + 7, 'asking again kept the approved date';
end $$;
select pg_temp.as_user('de000000-0000-4000-8000-000000000001');
update public.deadline_extensions set status = 'declined' where team_id = 'de000000-0000-4000-a000-000000000002';
reset role;
do $$ begin
  assert (pg_temp.ext()).status = 'declined' and (pg_temp.ext()).approved_date = current_date + 7, 'a decline kept the earlier approval';
  assert (select body from public.notifications where user_id = 'de000000-0000-4000-8000-000000000002' and title = 'No extension on DE Proposal')
         = 'It is still due ' || to_char(current_date + 7, 'Dy DD Mon') || '.', 'the team is told the date that still stands';
end $$;
select pg_temp.ok('asking again and declining keep the approved date');

-- 8. Missed-milestone alerts follow the team's due date.
update public.course_milestones set due_date = current_date - 2 where id = 'de000000-0000-4000-b000-000000000001';
select public.send_risk_alerts();
do $$ begin
  assert pg_temp.notes('de000000-0000-4000-8000-000000000001', 'DE Team missed a milestone%') = 0, 'an extended team was flagged as late';
end $$;
update public.deadline_extensions set approved_date = current_date - 1 where team_id = 'de000000-0000-4000-a000-000000000002';
select public.send_risk_alerts();
do $$ begin
  assert (select body from public.notifications where user_id = 'de000000-0000-4000-8000-000000000001' and title like 'DE Team missed a milestone%')
         = 'It was due ' || to_char(current_date - 1, 'Dy DD Mon') || ' and is not marked done.', 'the alert names the team''s own date';
end $$;
select pg_temp.ok('risk alerts use the team''s due date');

-- 9. A milestone the team marked done takes no requests.
insert into public.team_milestones (team_id, milestone_id, completed_by)
values ('de000000-0000-4000-a000-000000000002', 'de000000-0000-4000-b000-000000000001', 'de000000-0000-4000-8000-000000000002');
update public.course_milestones set due_date = current_date + 3 where id = 'de000000-0000-4000-b000-000000000001';
update public.deadline_extensions set approved_date = null, status = 'declined' where team_id = 'de000000-0000-4000-a000-000000000002';
select pg_temp.as_user('de000000-0000-4000-8000-000000000002');
do $$ begin
  update public.deadline_extensions set new_date = current_date + 20 where team_id = 'de000000-0000-4000-a000-000000000002';
  raise exception 'a done milestone took a request';
exception when raise_exception then
  if sqlerrm not like 'This milestone is already done%' then raise; end if;
end $$;
reset role;
select pg_temp.ok('a done milestone takes no requests');

rollback;
