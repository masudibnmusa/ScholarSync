-- Deadline extensions: a team asks for more time on a course milestone; the instructor approves or declines.
-- One row per team and milestone. `approved_date` is the team's due date once approved; asking again later keeps it
-- in force until the new request is decided. Everything that reads a team's due date uses
-- coalesce(approved_date, course_milestones.due_date).

create table public.deadline_extensions (
  team_id       uuid not null references public.teams (id) on delete cascade,
  milestone_id  uuid not null references public.course_milestones (id) on delete cascade,
  new_date      date not null,                       -- the date asked for
  reason        text not null check (length(trim(reason)) between 1 and 1000),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  approved_date date,                                -- the team's due date, once a request was approved
  requested_by  uuid references public.users (id) on delete set null,
  requested_at  timestamptz not null default now(),
  decided_by    uuid references public.users (id) on delete set null,
  decided_at    timestamptz,
  primary key (team_id, milestone_id)
);
create index deadline_extensions_milestone_idx on public.deadline_extensions (milestone_id);

alter table public.deadline_extensions enable row level security;
create policy extensions_select on public.deadline_extensions for select using (public.can_view_team(team_id));
create policy extensions_insert on public.deadline_extensions for insert
  with check (public.is_team_member(team_id) and public.milestone_in_team_course(milestone_id, team_id));
-- The team (asking again) and the instructor (deciding) both update; the trigger decides which columns each may change.
create policy extensions_update on public.deadline_extensions for update
  using (public.can_view_team(team_id)) with check (public.can_view_team(team_id));
grant select, insert, update on public.deadline_extensions to authenticated;

create function public.guard_extension() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  due date;
begin
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then return new; end if;
  if public.teaches_team(new.team_id) then
    if tg_op = 'INSERT' then raise exception 'Only the team can ask for more time' using errcode = 'P0001'; end if;
    if old.status <> 'pending' or new.status not in ('approved', 'declined') then
      raise exception 'Only a pending request can be approved or declined' using errcode = 'P0001';
    end if;
    new.new_date := old.new_date; new.reason := old.reason;
    new.requested_by := old.requested_by; new.requested_at := old.requested_at;
    new.approved_date := case when new.status = 'approved' then old.new_date else old.approved_date end;
    new.decided_by := auth.uid(); new.decided_at := now();
  else
    if exists (select 1 from public.teams t join public.courses c on c.id = t.course_id where t.id = new.team_id and c.archived_at is not null) then
      raise exception 'This course is archived and read-only' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.team_milestones where team_id = new.team_id and milestone_id = new.milestone_id) then
      raise exception 'This milestone is already done' using errcode = 'P0001';
    end if;
    select coalesce(case when tg_op = 'UPDATE' then old.approved_date end, m.due_date) into due
    from public.course_milestones m where m.id = new.milestone_id;
    if new.new_date <= due or new.new_date < current_date then
      raise exception 'Pick a date after the current due date' using errcode = 'P0001';
    end if;
    new.status := 'pending';
    new.approved_date := case when tg_op = 'UPDATE' then old.approved_date end;
    new.requested_by := auth.uid(); new.requested_at := now();
    new.decided_by := null; new.decided_at := null;
  end if;
  return new;
end $$;
create trigger extensions_guard before insert or update on public.deadline_extensions
  for each row execute function public.guard_extension();

-- A request: tell the instructor. A decision: tell the team.
create function public.on_extension_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  team_name text; course uuid; teacher uuid; ms_title text; ms_due date;
begin
  select t.name, t.course_id, c.instructor_id, m.title, m.due_date into team_name, course, teacher, ms_title, ms_due
  from public.teams t join public.courses c on c.id = t.course_id join public.course_milestones m on m.id = new.milestone_id
  where t.id = new.team_id;
  if new.status = 'pending' and (tg_op = 'INSERT' or new.requested_at is distinct from old.requested_at) then
    perform public.notify(teacher, 'task', team_name || ' asks for more time on ' || ms_title,
      'Until ' || to_char(new.new_date, 'Dy DD Mon') || ': ' || new.reason, '/instructor/courses/' || course);
  end if;
  if tg_op = 'UPDATE' and new.decided_at is not null and new.decided_at is distinct from old.decided_at then
    insert into public.notifications (user_id, type, title, body, link)
    select tm.user_id, 'task',
      case when new.status = 'approved' then 'More time on ' || ms_title || ': due ' || to_char(new.approved_date, 'Dy DD Mon')
           else 'No extension on ' || ms_title end,
      case when new.status = 'approved' then '' else 'It is still due ' || to_char(coalesce(new.approved_date, ms_due), 'Dy DD Mon') || '.' end,
      '/student/courses/' || course
    from public.team_members tm where tm.team_id = new.team_id;
  end if;
  return new;
end $$;
create trigger extensions_notify after insert or update on public.deadline_extensions
  for each row execute function public.on_extension_changed();

alter publication supabase_realtime add table public.deadline_extensions;

-- Missed-milestone alerts use each team's own due date (0017, unchanged otherwise).
create or replace function public.send_risk_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare sent integer;
begin
  with risks as (
    -- Milestones past the team's due date that the team hasn't marked done.
    select c.instructor_id as uid, t.id as team_id, c.id as course_id,
           t.name || ' missed a milestone: ' || cm.title as title,
           'It was due ' || to_char(coalesce(x.approved_date, cm.due_date), 'Dy DD Mon') || ' and is not marked done.' as body,
           'milestone-' || cm.id as tag
    from public.course_milestones cm
    join public.courses c on c.id = cm.course_id
    join public.teams t on t.course_id = c.id
    left join public.deadline_extensions x on x.team_id = t.id and x.milestone_id = cm.id
    where coalesce(x.approved_date, cm.due_date) < current_date
      and coalesce(x.approved_date, cm.due_date) >= current_date - 14 -- don't flood an instructor with history
      and not exists (select 1 from public.team_milestones tm where tm.team_id = t.id and tm.milestone_id = cm.id)
    union all
    -- Three or more unfinished tasks past their due date.
    select c.instructor_id, t.id, c.id,
           t.name || ' has ' || count(*) || ' overdue tasks',
           'Oldest was due ' || to_char(min(k.due_date), 'Dy DD Mon') || '. It may be worth checking in.',
           'overdue-' || to_char(current_date, 'IYYY-IW')
    from public.tasks k
    join public.teams t on t.id = k.team_id
    join public.courses c on c.id = t.course_id
    where k.status <> 'done' and k.due_date < current_date
    group by c.instructor_id, t.id, t.name, c.id
    having count(*) >= 3
  )
  insert into public.notifications (user_id, type, title, body, link)
  select r.uid, 'system'::public.notification_type, r.title, r.body,
         '/instructor/courses/' || r.course_id || '/teams/' || r.team_id || '?risk=' || r.tag
  from risks r
  where not exists (
    select 1 from public.notifications n
    where n.user_id = r.uid and n.link = '/instructor/courses/' || r.course_id || '/teams/' || r.team_id || '?risk=' || r.tag
  );
  get diagnostics sent = row_count;
  return sent;
end $$;
revoke execute on function public.send_risk_alerts() from public, anon, authenticated;
