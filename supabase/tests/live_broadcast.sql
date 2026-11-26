-- Checks live updates (0041): a change reaches only the people who share its team or course, deletes included,
-- and each person may listen to their own topic only.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/live_broadcast.sql
-- Everything happens in one transaction that is rolled back, so nothing is left behind.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name), now(), now(), '', '', '', ''
from (values ('e1000000-0000-4000-8000-000000000001', 'lb-teacher@test.invalid', 'LB Teacher'),
             ('e1000000-0000-4000-8000-000000000002', 'lb-ada@test.invalid', 'LB Ada'),
             ('e1000000-0000-4000-8000-000000000003', 'lb-ben@test.invalid', 'LB Ben (other team)'),
             ('e1000000-0000-4000-8000-000000000004', 'lb-out@test.invalid', 'LB Outsider')) v (id, email, name);
update public.users set role = 'instructor' where id = 'e1000000-0000-4000-8000-000000000001';
insert into public.courses (id, code, title, term, instructor_id)
values ('e1000000-0000-4000-a000-000000000001', 'LB-TEST', 'Live test', 'Test', 'e1000000-0000-4000-8000-000000000001');
insert into public.course_enrollments (course_id, user_id) values
  ('e1000000-0000-4000-a000-000000000001', 'e1000000-0000-4000-8000-000000000002'),
  ('e1000000-0000-4000-a000-000000000001', 'e1000000-0000-4000-8000-000000000003');
insert into public.teams (id, course_id, name) values
  ('e1000000-0000-4000-a000-000000000002', 'e1000000-0000-4000-a000-000000000001', 'LB Team'),
  ('e1000000-0000-4000-a000-000000000003', 'e1000000-0000-4000-a000-000000000001', 'LB Other');
insert into public.team_members (team_id, user_id) values
  ('e1000000-0000-4000-a000-000000000002', 'e1000000-0000-4000-8000-000000000002'),
  ('e1000000-0000-4000-a000-000000000003', 'e1000000-0000-4000-8000-000000000003');
insert into public.tasks (id, team_id, title) values ('e1000000-0000-4000-b000-000000000001', 'e1000000-0000-4000-a000-000000000002', 'LB task');

-- Who heard about `tbl` since the mark: sorted user names.
create temp table mark as select now() as at;
create function pg_temp.heard(tbl text) returns text language sql as $$
  select coalesce(string_agg(u.name, ', ' order by u.name), '')
  from (select distinct substr(m.topic, 6)::uuid as id from realtime.messages m
        where m.payload->>'table' = tbl and m.topic like 'live:%' and m.inserted_at >= (select at from mark)) x
  join public.users u on u.id = x.id
$$;
create function pg_temp.expect(got text, want text, what text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception '%: got [%], want [%]', what, got, want; end if;
end $$;

-- A task change: Ada's team and the instructor, not the other team or the outsider. Deletes too.
truncate mark; insert into mark values (clock_timestamp());
update public.tasks set title = 'LB task 2' where id = 'e1000000-0000-4000-b000-000000000001';
select pg_temp.expect(pg_temp.heard('tasks'), 'LB Ada, LB Teacher', 'task update');
truncate mark; insert into mark values (clock_timestamp());
delete from public.tasks where id = 'e1000000-0000-4000-b000-000000000001';
select pg_temp.expect(pg_temp.heard('tasks'), 'LB Ada, LB Teacher', 'task delete');

-- An announcement: the whole course, not the outsider.
truncate mark; insert into mark values (clock_timestamp());
insert into public.course_announcements (course_id, author_id, title, body)
values ('e1000000-0000-4000-a000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'LB', 'Hello');
select pg_temp.expect(pg_temp.heard('course_announcements'), 'LB Ada, LB Ben (other team), LB Teacher', 'announcement');

-- Someone removed from a team still hears it.
truncate mark; insert into mark values (clock_timestamp());
delete from public.team_members where user_id = 'e1000000-0000-4000-8000-000000000002';
select pg_temp.expect(pg_temp.heard('team_members'), 'LB Ada, LB Teacher', 'member removed');

-- A profile change: people in the person's courses (and the person), not the outsider.
truncate mark; insert into mark values (clock_timestamp());
update public.users set bio = 'hi' where id = 'e1000000-0000-4000-8000-000000000003';
select pg_temp.expect(pg_temp.heard('users'), 'LB Ada, LB Ben (other team), LB Teacher', 'profile');

-- Topics: Ada may listen to her own, not Ben's.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('realtime.topic', 'live:e1000000-0000-4000-8000-000000000002', true);
select pg_temp.expect((select count(*) > 0 from realtime.messages where extension = 'broadcast')::text, 'true', 'own topic');
select set_config('realtime.topic', 'live:e1000000-0000-4000-8000-000000000003', true);
select pg_temp.expect((select count(*) from realtime.messages)::text, '0', 'other topic');
reset role;

\echo 'live_broadcast: all checks passed'
rollback;
