-- Checks team retrospectives (0039): one shared answer per team and milestone, who may write and read it, the archive lock.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/team_retros.sql
-- Everything happens in one transaction that is rolled back, so nothing is left behind.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name), now(), now(), '', '', '', ''
from (values ('e7000000-0000-4000-8000-000000000001', 'tr-teacher@test.invalid', 'TR Teacher'),
             ('e7000000-0000-4000-8000-000000000002', 'tr-ada@test.invalid', 'TR Ada'),
             ('e7000000-0000-4000-8000-000000000003', 'tr-ben@test.invalid', 'TR Ben'),
             ('e7000000-0000-4000-8000-000000000004', 'tr-out@test.invalid', 'TR Other team')) v (id, email, name);
update public.users set role = 'instructor' where id = 'e7000000-0000-4000-8000-000000000001';
insert into public.courses (id, code, title, term, instructor_id) values
  ('e7000000-0000-4000-a000-000000000001', 'TR-TEST', 'Retro test', 'Test', 'e7000000-0000-4000-8000-000000000001'),
  ('e7000000-0000-4000-a000-000000000009', 'TR-ELSE', 'Another', 'Test', 'e7000000-0000-4000-8000-000000000001');
insert into public.course_enrollments (course_id, user_id)
select 'e7000000-0000-4000-a000-000000000001', id::uuid
from (values ('e7000000-0000-4000-8000-000000000002'), ('e7000000-0000-4000-8000-000000000003'), ('e7000000-0000-4000-8000-000000000004')) v (id);
insert into public.teams (id, course_id, name) values
  ('e7000000-0000-4000-a000-000000000002', 'e7000000-0000-4000-a000-000000000001', 'TR Team'),
  ('e7000000-0000-4000-a000-000000000003', 'e7000000-0000-4000-a000-000000000001', 'TR Other');
insert into public.team_members (team_id, user_id) values
  ('e7000000-0000-4000-a000-000000000002', 'e7000000-0000-4000-8000-000000000002'),
  ('e7000000-0000-4000-a000-000000000002', 'e7000000-0000-4000-8000-000000000003'),
  ('e7000000-0000-4000-a000-000000000003', 'e7000000-0000-4000-8000-000000000004');
insert into public.course_milestones (id, course_id, title, due_date) values
  ('e7000000-0000-4000-b000-000000000001', 'e7000000-0000-4000-a000-000000000001', 'TR Demo', current_date - 1),
  ('e7000000-0000-4000-b000-000000000009', 'e7000000-0000-4000-a000-000000000009', 'Elsewhere', current_date - 1);

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true)
$$;
create function pg_temp.ok(what text) returns void language plpgsql as $$ begin raise notice 'ok: %', what; end $$;
create function pg_temp.retro() returns public.team_retros language sql as
  $$ select * from public.team_retros where team_id = 'e7000000-0000-4000-a000-000000000002' $$;

-- 1. Ada writes it; Ben edits the same one; who and when come from the session.
select pg_temp.as_user('e7000000-0000-4000-8000-000000000002');
insert into public.team_retros (team_id, milestone_id, went_well, didnt, updated_by, updated_at)
values ('e7000000-0000-4000-a000-000000000002', 'e7000000-0000-4000-b000-000000000001', 'Pairing', '', 'e7000000-0000-4000-8000-000000000004', now() - interval '9 days');
select pg_temp.as_user('e7000000-0000-4000-8000-000000000003');
insert into public.team_retros (team_id, milestone_id, went_well, didnt)
values ('e7000000-0000-4000-a000-000000000002', 'e7000000-0000-4000-b000-000000000001', 'Pairing', 'Late merges')
on conflict (team_id, milestone_id) do update set went_well = excluded.went_well, didnt = excluded.didnt;
reset role;
do $$ begin
  assert (pg_temp.retro()).didnt = 'Late merges', 'Ben''s edit didn''t land';
  assert (pg_temp.retro()).updated_by = 'e7000000-0000-4000-8000-000000000003', 'the writer comes from the session';
  assert (pg_temp.retro()).updated_at = now(), 'the time comes from the session';
  assert (select count(*) from public.team_retros) = 1, 'there is more than one per team and milestone';
end $$;
select pg_temp.ok('one shared retro per team and milestone');

-- 2. An empty one is refused; keys can't be moved; nor another course's milestone.
select pg_temp.as_user('e7000000-0000-4000-8000-000000000002');
do $$ begin
  update public.team_retros set went_well = ' ', didnt = '' where team_id = 'e7000000-0000-4000-a000-000000000002';
  raise exception 'an empty retro was saved';
exception when check_violation then null;
end $$;
do $$ begin
  update public.team_retros set team_id = 'e7000000-0000-4000-a000-000000000003' where team_id = 'e7000000-0000-4000-a000-000000000002';
  raise exception 'a retro moved to another team';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.team_retros (team_id, milestone_id, went_well) values ('e7000000-0000-4000-a000-000000000002', 'e7000000-0000-4000-b000-000000000009', 'x');
  raise exception 'a retro for another course''s milestone';
exception when insufficient_privilege then null;
end $$;
reset role;
select pg_temp.ok('no empty retros, no moved keys, only this course');

-- 3. Another team can't see or write it; the instructor reads it but doesn't write.
select pg_temp.as_user('e7000000-0000-4000-8000-000000000004');
do $$ begin assert (select count(*) from public.team_retros) = 0, 'another team sees the retro'; end $$;
update public.team_retros set didnt = 'sabotage';
select pg_temp.as_user('e7000000-0000-4000-8000-000000000001');
do $$ begin assert (select count(*) from public.team_retros) = 1, 'the instructor can''t read it'; end $$;
update public.team_retros set didnt = 'instructor edit';
do $$ begin
  insert into public.team_retros (team_id, milestone_id, went_well) values ('e7000000-0000-4000-a000-000000000003', 'e7000000-0000-4000-b000-000000000001', 'x');
  raise exception 'the instructor wrote a retro';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin assert (pg_temp.retro()).didnt = 'Late merges', 'someone outside the team changed it'; end $$;
select pg_temp.ok('only the team writes; the instructor reads');

-- 4. An archived course is read-only.
update public.courses set archived_at = now() where id = 'e7000000-0000-4000-a000-000000000001';
select pg_temp.as_user('e7000000-0000-4000-8000-000000000002');
do $$ begin
  update public.team_retros set didnt = 'too late' where team_id = 'e7000000-0000-4000-a000-000000000002';
  raise exception 'edited in an archived course';
exception when raise_exception then
  if sqlerrm not like 'This course is archived%' then raise; end if;
end $$;
reset role;
select pg_temp.ok('archived courses are read-only');

rollback;
