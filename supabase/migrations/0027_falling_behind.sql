-- "Who's falling behind": a daily check per student, per team, on three signals:
--   overdue   2+ of their tasks are past due, or one is 3+ days late
--   silence   7+ days without a message in team chat while teammates kept talking (and in the team for 7+ days)
--   peers     teammates rated them 2.5 of 5 or lower on average, from 2+ reviews
-- Two signals together count as falling behind. The student gets a private nudge first; if two signals still hold
-- 3 days later, the instructor is told once. Getting better ends the episode; slipping back within 7 days continues
-- it (no second nudge), later than that starts a new one.
-- Complements send_risk_alerts() (0017), which looks at whole teams (missed milestones, a pile of overdue tasks).

create table public.falling_behind (
  team_id      uuid not null references public.teams (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  reasons      text[] not null,
  flagged_at   timestamptz not null default now(),   -- this episode started, and the student was nudged
  escalated_at timestamptz,                          -- the instructor was told
  resolved_at  timestamptz,                          -- fewer than two signals since
  primary key (team_id, user_id)
);
alter table public.falling_behind enable row level security;
create policy falling_behind_select on public.falling_behind for select using (public.teaches_team(team_id));

create function public.check_falling_behind(out nudged integer, out escalated integer, out resolved integer)
language plpgsql security definer set search_path = '' as $$
begin
  drop table if exists pg_temp.behind;
  create temp table behind on commit drop as
  with base as (
    select tm.team_id, tm.user_id, tm.joined_at, t.name as team_name, c.instructor_id, u.name as student,
      (select count(*) from public.tasks k
        where k.team_id = tm.team_id and k.assignee_id = tm.user_id and k.status <> 'done' and k.due_date < current_date) as overdue,
      (select min(k.due_date) from public.tasks k
        where k.team_id = tm.team_id and k.assignee_id = tm.user_id and k.status <> 'done' and k.due_date < current_date) as oldest,
      (select max(m.created_at) from public.messages m where m.team_id = tm.team_id and m.sender_id = tm.user_id) as last_said,
      exists (select 1 from public.messages m
        where m.team_id = tm.team_id and m.sender_id <> tm.user_id and m.created_at > now() - interval '7 days') as others_talk,
      (select avg(p.rating) from public.peer_reviews p where p.team_id = tm.team_id and p.reviewee_id = tm.user_id) as peer_avg,
      (select count(*) from public.peer_reviews p where p.team_id = tm.team_id and p.reviewee_id = tm.user_id) as peer_n
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    join public.courses c on c.id = t.course_id
    join public.users u on u.id = tm.user_id
    where c.archived_at is null and u.role = 'student'
  )
  select team_id, user_id, team_name, instructor_id, student,
    array_remove(array[
      case when overdue >= 2 or oldest <= current_date - 3
        then overdue || case when overdue = 1 then ' overdue task' else ' overdue tasks' end end,
      case when others_talk and joined_at < now() - interval '7 days' and coalesce(last_said, joined_at) < now() - interval '7 days'
        then 'no team chat for ' || (current_date - coalesce(last_said, joined_at)::date) || ' days' end,
      case when peer_n >= 2 and peer_avg <= 2.5 then 'low peer review scores' end
    ], null) as reasons
  from base;
  delete from pg_temp.behind where cardinality(reasons) < 2;

  -- Better now: end the episode.
  update public.falling_behind f set resolved_at = now()
  where f.resolved_at is null
    and not exists (select 1 from pg_temp.behind b where b.team_id = f.team_id and b.user_id = f.user_id);
  get diagnostics resolved = row_count;

  -- Slipped back within a week: same episode, no new nudge.
  update public.falling_behind f set resolved_at = null, reasons = b.reasons
  from pg_temp.behind b
  where b.team_id = f.team_id and b.user_id = f.user_id and (f.resolved_at is null or f.resolved_at >= now() - interval '7 days');

  -- New episodes (or a long-resolved one starting over): a private nudge to the student.
  with fresh as (
    insert into public.falling_behind as f (team_id, user_id, reasons)
    select team_id, user_id, reasons from pg_temp.behind
    on conflict (team_id, user_id) do update
      set reasons = excluded.reasons, flagged_at = now(), escalated_at = null, resolved_at = null
      where f.resolved_at is not null and f.resolved_at < now() - interval '7 days'
    returning f.team_id, f.user_id
  )
  insert into public.notifications (user_id, type, title, body, link)
  select b.user_id, 'system', 'A quick check-in on ' || b.team_name,
         'Noticed: ' || array_to_string(b.reasons, ', ') || '. A short update to your team, or asking for help, goes a long way.',
         '/student?team=' || b.team_id
  from fresh join pg_temp.behind b using (team_id, user_id);
  get diagnostics nudged = row_count;

  -- Still behind 3 days after the nudge: tell the instructor, once per episode.
  with due as (
    update public.falling_behind f set escalated_at = now()
    from pg_temp.behind b
    where b.team_id = f.team_id and b.user_id = f.user_id
      and f.resolved_at is null and f.escalated_at is null and f.flagged_at <= now() - interval '3 days'
    returning f.team_id, f.user_id
  )
  insert into public.notifications (user_id, type, title, body, link)
  select b.instructor_id, 'system', b.student || ' may be falling behind in ' || b.team_name,
         'Still ' || array_to_string(b.reasons, ', ') || ', 3 days after a private nudge.',
         '/instructor?team=' || b.team_id
  from due join pg_temp.behind b using (team_id, user_id);
  get diagnostics escalated = row_count;
end $$;
revoke execute on function public.check_falling_behind() from public, anon, authenticated;
