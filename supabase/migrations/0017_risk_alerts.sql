-- At-risk alerts: a daily job tells the instructor about teams that missed a milestone or have piled up overdue tasks.
-- Each alert is sent once: per missed milestone, and per ISO week for overdue tasks (deduped by link, like 0007).
create function public.send_risk_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare sent integer;
begin
  with risks as (
    -- Milestones past their date that the team hasn't marked done.
    select c.instructor_id as uid, t.id as team_id, c.id as course_id,
           t.name || ' missed a milestone: ' || cm.title as title,
           'It was due ' || to_char(cm.due_date, 'Dy DD Mon') || ' and is not marked done.' as body,
           'milestone-' || cm.id as tag
    from public.course_milestones cm
    join public.courses c on c.id = cm.course_id
    join public.teams t on t.course_id = c.id
    where cm.due_date < current_date
      and cm.due_date >= current_date - 14 -- don't flood an instructor with history when this ships
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
