-- Chat: reply to a message (quoted above the reply) and react with an emoji. Search needs no schema.

alter table public.messages add column reply_to uuid references public.messages (id) on delete set null;

-- A reply must answer a message in the same team. Columns are qualified: inside the subquery a bare
-- reply_to would mean the quoted message's own column.
drop policy messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (public.can_view_team(team_id) and sender_id = auth.uid()
              and (messages.reply_to is null
                   or exists (select 1 from public.messages p where p.id = messages.reply_to and p.team_id = messages.team_id)));

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade default auth.uid(),
  team_id    uuid not null references public.teams (id) on delete cascade,  -- copied from the message, for RLS and Realtime filters
  emoji      text not null check (emoji in ('👍', '❤️', '😂', '🎉', '👀', '✅')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index message_reactions_team_idx on public.message_reactions (team_id);

alter table public.message_reactions enable row level security;
create policy reactions_select on public.message_reactions for select using (public.can_view_team(team_id));
create policy reactions_insert on public.message_reactions for insert
  with check (user_id = auth.uid() and public.can_view_team(team_id)
              and exists (select 1 from public.messages m where m.id = message_reactions.message_id and m.team_id = message_reactions.team_id));
create policy reactions_delete on public.message_reactions for delete using (user_id = auth.uid());

create trigger message_reactions_archived before insert or update or delete on public.message_reactions
  for each row execute function public.block_archived_course();

-- Live for everyone in the team. Full replica identity so a removed reaction still carries its team_id.
alter table public.message_reactions replica identity full;
alter publication supabase_realtime add table public.message_reactions;
