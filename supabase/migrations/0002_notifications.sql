-- Notifications are written by the database itself, so every write path (app, AI jobs, admin)
-- produces them and clients never need insert rights on public.notifications.

create function public.notify(p_user uuid, p_type public.notification_type, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user, p_type, p_title, coalesce(p_body, ''), p_link)
$$;
revoke execute on function public.notify(uuid, public.notification_type, text, text, text) from public, anon, authenticated;

-- Task assigned (or re-assigned) to someone other than the person doing it.
create function public.on_task_assigned() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null
     and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public.notify(new.assignee_id, 'task', 'New task assigned', new.title, 'student-tasks');
  end if;
  return new;
end $$;
create trigger tasks_notify_assignee after insert or update of assignee_id on public.tasks
  for each row execute function public.on_task_assigned();

-- New chat message: tell every other team member.
create function public.on_message_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sender text;
begin
  select name into sender from public.users where id = new.sender_id;
  insert into public.notifications (user_id, type, title, body, link)
  select m.user_id, 'message', 'New message from ' || coalesce(sender, 'a teammate'),
         left(coalesce(nullif(new.content, ''), 'Shared a file'), 140), 'student-chat'
  from public.team_members m
  where m.team_id = new.team_id and m.user_id is distinct from new.sender_id;
  return new;
end $$;
create trigger messages_notify_team after insert on public.messages
  for each row execute function public.on_message_created();

-- Peer review received: the reviewee is told, but never by whom.
create function public.on_review_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(new.reviewee_id, 'review', 'You received a peer review',
                        'A teammate rated your contribution.', 'student-peer-review');
  return new;
end $$;
create trigger reviews_notify_reviewee after insert on public.peer_reviews
  for each row execute function public.on_review_created();

-- AI conflict alert: tell the course instructor.
create function public.on_alert_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(c.instructor_id, 'conflict', 'Conflict alert: ' || t.name, new.summary, 'instructor-conflicts')
  from public.teams t join public.courses c on c.id = t.course_id
  where t.id = new.team_id;
  return new;
end $$;
create trigger alerts_notify_instructor after insert on public.conflict_alerts
  for each row execute function public.on_alert_created();

-- AI task suggestion: tell the team.
create function public.on_suggestion_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select m.user_id, 'task', 'AI suggested a task', new.title, 'student-chat'
  from public.team_members m where m.team_id = new.team_id;
  return new;
end $$;
create trigger suggestions_notify_team after insert on public.task_suggestions
  for each row execute function public.on_suggestion_created();
