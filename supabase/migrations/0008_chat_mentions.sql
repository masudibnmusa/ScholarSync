-- @mentions in team chat: "@Nazmul" notifies that team member with "X mentioned you" instead of the
-- generic "New message" notification. Everything else is unchanged from 0003.

-- True when `content` has "@" + a word of `full_name` (case-insensitive, not followed by a letter or digit).
-- Any name word of 3+ letters counts, plus the first word, so "Md Nazmul Hasan" answers to @Nazmul and @Md.
-- Regex characters in names are escaped.
create or replace function public.mentions(content text, full_name text) returns boolean
language sql immutable set search_path = '' as $$
  select exists (
    select 1
    from regexp_split_to_table(lower(trim(full_name)), '\s+') with ordinality as w(word, n)
    where (n = 1 or length(w.word) >= 3)
      and lower(content) ~ ('(^|[^[:alnum:]_])@'
                            || regexp_replace(w.word, '([^[:alnum:]])', '\\\1', 'g')
                            || '($|[^[:alnum:]_])')
  )
$$;

create or replace function public.on_message_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sender text;
  team_name text;
  teacher uuid;
  team_link text := '/instructor?team=' || new.team_id || '&view=chat';
  chat_link text := '/student?team=' || new.team_id || '&view=chat';
  preview text := left(coalesce(nullif(new.content, ''), 'Shared a file'), 140);
begin
  select name into sender from public.users where id = new.sender_id;

  insert into public.notifications (user_id, type, title, body, link)
  select m.user_id, 'message',
         case when public.mentions(new.content, u.name)
              then coalesce(sender, 'A teammate') || ' mentioned you'
              else 'New message from ' || coalesce(sender, 'a teammate') end,
         preview,
         case when public.mentions(new.content, u.name) then chat_link else 'student-chat' end
  from public.team_members m
  join public.users u on u.id = m.user_id
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
