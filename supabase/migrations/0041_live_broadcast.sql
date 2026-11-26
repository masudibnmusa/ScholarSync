-- Live updates go out as Broadcast messages to one private topic per person ("live:<user id>"), only to the people who
-- share the changed row's team or course. Before, every browser listened to 33 tables unfiltered: Realtime checked RLS
-- per subscriber for every change, and deletes (which RLS can't check) reached every online user.
-- The message is only the table name; each page then reloads what it shows through RLS as before.

-- Everyone in these courses: enrolled students, the instructor and TAs.
create function public.live_course_people(c uuid[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.course_enrollments where course_id = any(c)
  union select instructor_id from public.courses where id = any(c)
  union select user_id from public.course_tas where course_id = any(c)
$$;

-- The course staff of these teams, plus their members when `members` is true.
create function public.live_team_people(t uuid[], members boolean) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.team_members where members and team_id = any(t)
  union select c.instructor_id from public.teams tm join public.courses c on c.id = tm.course_id where tm.id = any(t)
  union select ta.user_id from public.teams tm join public.course_tas ta on ta.course_id = tm.course_id where tm.id = any(t)
$$;

-- Statement trigger. Arguments: scope (team | team_staff | course | task | question | user), the column holding that
-- scope's id, then any columns naming people who must hear too (someone removed from a team is no longer in it).
create function public.broadcast_live() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  scope text := tg_argv[0];
  src text := case tg_op when 'INSERT' then 'select * from new_rows' when 'DELETE' then 'select * from old_rows'
                         else 'select * from new_rows union all select * from old_rows' end;
  ids uuid[];
  extra uuid[];
  people uuid[] := '{}';
begin
  execute format('select array_agg(distinct %I) from (%s) r', tg_argv[1], src) into ids;
  for i in 2 .. tg_nargs - 1 loop
    execute format('select array_agg(distinct %I) from (%s) r', tg_argv[i], src) into extra;
    people := people || coalesce(extra, '{}');
  end loop;
  if ids is null then return null; end if;

  if scope = 'task' then
    ids := array(select team_id from public.tasks where id = any(ids)); -- gone with a deleted task: its own change says so
    scope := 'team';
  elsif scope = 'question' then
    ids := array(select course_id from public.help_questions where id = any(ids));
    scope := 'course';
  elsif scope = 'user' then -- a profile: everyone in the person's courses
    ids := array(select course_id from public.course_enrollments where user_id = any(ids)
                 union select id from public.courses where instructor_id = any(ids)
                 union select course_id from public.course_tas where user_id = any(ids));
    scope := 'course';
  end if;

  if scope = 'course' then people := people || array(select public.live_course_people(ids));
  else people := people || array(select public.live_team_people(ids, scope = 'team'));
  end if;

  perform realtime.send(jsonb_build_object('table', tg_table_name), 'change', 'live:' || u, true)
  from (select distinct u from unnest(people) u where u is not null) x;
  return null;
end $$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('users', $a$'user', 'id', 'id'$a$),
    ('courses', $a$'course', 'id'$a$),
    ('course_enrollments', $a$'course', 'course_id', 'user_id'$a$),
    ('teams', $a$'course', 'course_id'$a$),
    ('team_members', $a$'team', 'team_id', 'user_id'$a$),
    ('tasks', $a$'team', 'team_id'$a$),
    ('files', $a$'team', 'team_id'$a$),
    ('task_comments', $a$'task', 'task_id'$a$),
    ('task_checklist_items', $a$'task', 'task_id'$a$),
    ('task_dependencies', $a$'team', 'team_id'$a$),
    ('course_announcements', $a$'course', 'course_id'$a$),
    ('course_milestones', $a$'course', 'course_id'$a$),
    ('team_milestones', $a$'team', 'team_id'$a$),
    ('submissions', $a$'team', 'team_id'$a$),
    ('peer_reviews', $a$'team_staff', 'team_id', 'reviewer_id', 'reviewee_id'$a$),
    ('team_summaries', $a$'team', 'team_id'$a$),
    ('standups', $a$'team', 'team_id'$a$),
    ('standup_summaries', $a$'team', 'team_id'$a$),
    ('rubric_criteria', $a$'course', 'course_id'$a$),
    ('team_grades', $a$'team', 'team_id'$a$),
    ('student_grade_factors', $a$'team', 'team_id'$a$),
    ('conflict_alerts', $a$'team_staff', 'team_id'$a$),
    ('task_suggestions', $a$'team', 'team_id'$a$),
    ('falling_behind', $a$'team_staff', 'team_id', 'user_id'$a$),
    ('repo_activity', $a$'team', 'team_id'$a$),
    ('team_charters', $a$'team', 'team_id'$a$),
    ('charter_agreements', $a$'team', 'team_id'$a$),
    ('office_hours', $a$'course', 'course_id'$a$),
    ('deadline_extensions', $a$'team', 'team_id'$a$),
    ('help_questions', $a$'course', 'course_id'$a$),
    ('help_answers', $a$'question', 'question_id'$a$),
    ('rubric_checks', $a$'team', 'team_id'$a$),
    ('team_retros', $a$'team', 'team_id'$a$),
    ('course_tas', $a$'course', 'course_id', 'user_id'$a$)
  ) v (tbl, args) loop
    -- A trigger with transition tables takes one event, so three per table.
    execute format('create trigger live_insert after insert on public.%I referencing new table as new_rows
                    for each statement execute function public.broadcast_live(%s)', r.tbl, r.args);
    execute format('create trigger live_update after update on public.%I referencing new table as new_rows old table as old_rows
                    for each statement execute function public.broadcast_live(%s)', r.tbl, r.args);
    execute format('create trigger live_delete after delete on public.%I referencing old table as old_rows
                    for each statement execute function public.broadcast_live(%s)', r.tbl, r.args);
    -- Postgres Changes no longer needed for this table (chat, tasks, reactions, focus and notifications keep theirs).
    if r.tbl <> 'tasks' and exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = r.tbl) then
      execute format('alter publication supabase_realtime drop table public.%I', r.tbl);
    end if;
  end loop;
end $$;

-- Each person may listen to their own topic only.
create policy live_own_topic on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and realtime.topic() = 'live:' || (select auth.uid())::text);
