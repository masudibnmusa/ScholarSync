-- Office hours: the instructor publishes time slots for a course; a team books one (one upcoming booking per team per
-- course). Booking and cancelling go through functions so students never write the table directly. Times in messages
-- use the time zone the instructor created the slot in.

create table public.office_hours (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  starts_at   timestamptz not null,
  minutes     smallint not null check (minutes between 5 and 240),
  tz          text not null default 'UTC' check (length(tz) <= 64),
  location    text not null default '' check (length(location) <= 300),
  team_id     uuid references public.teams (id) on delete set null,
  topic       text not null default '' check (length(topic) <= 500),
  booked_by   uuid references public.users (id) on delete set null,
  booked_at   timestamptz,
  reminded_at timestamptz,
  created_at  timestamptz not null default now()
);
create index office_hours_course_start on public.office_hours (course_id, starts_at);
create index office_hours_reminders on public.office_hours (starts_at) where team_id is not null and reminded_at is null;
alter table public.office_hours enable row level security;
create policy office_hours_select on public.office_hours for select
  using (public.teaches_course(course_id) or public.is_enrolled(course_id));
create policy office_hours_insert on public.office_hours for insert
  with check (public.teaches_course(course_id) and team_id is null and starts_at > now());
create policy office_hours_delete on public.office_hours for delete using (public.teaches_course(course_id));

create function public.office_hour_label(s public.office_hours) returns text
language sql stable set search_path = '' as $$
  select to_char(s.starts_at at time zone s.tz, 'Dy DD Mon, HH24:MI') || coalesce(nullif(' · ' || s.location, ' · '), '')
$$;

-- A team member books a free, future slot for their team.
create function public.book_office_hour(p_slot uuid, p_topic text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.office_hours;
  my_team uuid; team_name text; course_code text; teacher uuid;
begin
  select * into s from public.office_hours where id = p_slot for update;
  if s.id is null or not public.is_enrolled(s.course_id) then raise exception 'Slot not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.courses where id = s.course_id and archived_at is not null) then
    raise exception 'This course is archived' using errcode = 'P0001';
  end if;
  if s.starts_at <= now() then raise exception 'This time has passed' using errcode = 'P0001'; end if;
  if s.team_id is not null then raise exception 'Another team just booked this time' using errcode = 'P0001'; end if;
  select t.id, t.name into my_team, team_name from public.teams t join public.team_members m on m.team_id = t.id
  where t.course_id = s.course_id and m.user_id = auth.uid();
  if my_team is null then raise exception 'Join a team in this course to book office hours' using errcode = 'P0001'; end if;
  if exists (select 1 from public.office_hours where team_id = my_team and course_id = s.course_id and starts_at > now()) then
    raise exception 'Your team already has an upcoming booking. Cancel it to pick another time.' using errcode = 'P0001';
  end if;
  update public.office_hours set team_id = my_team, topic = left(coalesce(trim(p_topic), ''), 500), booked_by = auth.uid(), booked_at = now(), reminded_at = null
  where id = p_slot;
  select c.code, c.instructor_id into course_code, teacher from public.courses c where c.id = s.course_id;
  perform public.notify(teacher, 'system', team_name || ' booked office hours', public.office_hour_label(s)
    || coalesce(nullif(': ' || trim(p_topic), ': '), ''), '/instructor/courses/' || s.course_id);
end $$;
revoke execute on function public.book_office_hour(uuid, text) from public, anon;
grant execute on function public.book_office_hour(uuid, text) to authenticated;

-- The booking team or the instructor frees a booked slot; the other side is told.
create function public.cancel_office_hour(p_slot uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.office_hours;
  team_name text; teacher uuid; by_teacher boolean;
begin
  select * into s from public.office_hours where id = p_slot for update;
  if s.id is null or s.team_id is null then return; end if;
  by_teacher := public.teaches_course(s.course_id);
  if not by_teacher and not public.is_team_member(s.team_id) then raise exception 'Only the team or the instructor can cancel' using errcode = 'P0001'; end if;
  update public.office_hours set team_id = null, topic = '', booked_by = null, booked_at = null, reminded_at = null where id = p_slot;
  if s.starts_at <= now() then return; end if;
  select t.name, c.instructor_id into team_name, teacher from public.teams t join public.courses c on c.id = t.course_id where t.id = s.team_id;
  if by_teacher then
    insert into public.notifications (user_id, type, title, body, link)
    select m.user_id, 'system', 'Your office hours booking was cancelled', public.office_hour_label(s) || '. Pick another time on the course page.',
           '/student/courses/' || s.course_id
    from public.team_members m where m.team_id = s.team_id;
  else
    perform public.notify(teacher, 'system', team_name || ' cancelled office hours', public.office_hour_label(s), '/instructor/courses/' || s.course_id);
  end if;
end $$;
revoke execute on function public.cancel_office_hour(uuid) from public, anon;
grant execute on function public.cancel_office_hour(uuid) to authenticated;

-- The instructor removes a slot a team had booked: tell the team.
create function public.on_office_hour_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Not when the whole course is being deleted (its row is already gone).
  if old.team_id is not null and old.starts_at > now() and exists (select 1 from public.courses where id = old.course_id) then
    insert into public.notifications (user_id, type, title, body, link)
    select m.user_id, 'system', 'Office hours you booked were removed', public.office_hour_label(old) || '. Pick another time on the course page.',
           '/student/courses/' || old.course_id
    from public.team_members m where m.team_id = old.team_id;
  end if;
  return old;
end $$;
create trigger office_hours_deleted after delete on public.office_hours
  for each row execute function public.on_office_hour_deleted();

alter publication supabase_realtime add table public.office_hours;
