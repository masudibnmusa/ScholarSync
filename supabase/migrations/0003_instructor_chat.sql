-- Instructors can post and attach files in the chat of teams in their courses, not only read it.
-- The messages_notify_team trigger (0002) already tells every team member about a new message.
drop policy messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (public.can_view_team(team_id) and sender_id = auth.uid());

drop policy files_insert on public.files;
create policy files_insert on public.files for insert
  with check (public.can_view_team(team_id) and uploader_id = auth.uid());

drop policy team_files_upload on storage.objects;
create policy team_files_upload on storage.objects for insert
  with check (bucket_id = 'team-files' and public.can_view_team(((storage.foldername(name))[1])::uuid));

-- New chat message: tell every other team member, and tell the course instructor when a student
-- replies in a chat the instructor has posted in. One unread reply notification per team at a time.
create or replace function public.on_message_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sender text;
  team_name text;
  teacher uuid;
  team_link text := '/instructor?team=' || new.team_id || '&view=chat';
begin
  select name into sender from public.users where id = new.sender_id;
  insert into public.notifications (user_id, type, title, body, link)
  select m.user_id, 'message', 'New message from ' || coalesce(sender, 'a teammate'),
         left(coalesce(nullif(new.content, ''), 'Shared a file'), 140), 'student-chat'
  from public.team_members m
  where m.team_id = new.team_id and m.user_id is distinct from new.sender_id;

  select t.name, c.instructor_id into team_name, teacher
  from public.teams t join public.courses c on c.id = t.course_id where t.id = new.team_id;
  if teacher is not null and teacher is distinct from new.sender_id
     and exists (select 1 from public.messages where team_id = new.team_id and sender_id = teacher)
     and not exists (select 1 from public.notifications
                     where user_id = teacher and link = team_link and read_at is null) then
    perform public.notify(teacher, 'message', team_name || ' replied in chat',
                          left(coalesce(sender, 'A student') || ': ' || coalesce(nullif(new.content, ''), 'Shared a file'), 140),
                          team_link);
  end if;
  return new;
end $$;
