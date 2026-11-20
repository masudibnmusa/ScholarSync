-- Deadline reminders: a daily job tells each assignee about unfinished tasks due tomorrow.
-- Lives in the database like the other notification writers; the Inngest cron only calls it.
-- Safe to run more than once a day: a task is reminded at most once per due date.
create function public.send_due_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare sent integer;
begin
  insert into public.notifications (user_id, type, title, body, link)
  select k.assignee_id, 'task', 'Due tomorrow: ' || k.title,
         t.name || ' · ' || to_char(k.due_date, 'Dy DD Mon'),
         '/student?team=' || k.team_id || '&task=' || k.id || '&due=' || k.due_date
  from public.tasks k
  join public.teams t on t.id = k.team_id
  where k.due_date = current_date + 1
    and k.status <> 'done'
    and k.assignee_id is not null
    and not exists (
      select 1 from public.notifications n
      where n.user_id = k.assignee_id
        and n.link = '/student?team=' || k.team_id || '&task=' || k.id || '&due=' || k.due_date
    );
  get diagnostics sent = row_count;
  return sent;
end $$;
revoke execute on function public.send_due_reminders() from public, anon, authenticated;
