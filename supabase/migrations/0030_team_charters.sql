-- Team charter: what a team agrees on at the start (roles, meeting times, what happens when work is missed, how they
-- talk). Any member can write or edit it; each member agrees to it. Editing asks everyone else to agree again.

create table public.team_charters (
  team_id       uuid primary key references public.teams (id) on delete cascade,
  roles         text not null default '' check (length(roles) <= 2000),
  meetings      text not null default '' check (length(meetings) <= 2000),
  missed_work   text not null default '' check (length(missed_work) <= 2000),
  communication text not null default '' check (length(communication) <= 2000),
  updated_by    uuid references public.users (id) on delete set null,
  updated_at    timestamptz not null default now()
);
alter table public.team_charters enable row level security;
create policy team_charters_select on public.team_charters for select using (public.can_view_team(team_id));
create policy team_charters_insert on public.team_charters for insert with check (public.is_team_member(team_id));
create policy team_charters_update on public.team_charters for update
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

create table public.charter_agreements (
  team_id   uuid not null references public.team_charters (team_id) on delete cascade,
  user_id   uuid not null references public.users (id) on delete cascade,
  agreed_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table public.charter_agreements enable row level security;
create policy charter_agreements_select on public.charter_agreements for select using (public.can_view_team(team_id));
create policy charter_agreements_insert on public.charter_agreements for insert
  with check (user_id = auth.uid() and public.is_team_member(team_id));

create trigger team_charters_archived before insert or update on public.team_charters
  for each row execute function public.block_archived_course();
create trigger charter_agreements_archived before insert on public.charter_agreements
  for each row execute function public.block_archived_course();

-- The writer and time come from the session, not the client.
create function public.stamp_team_charter() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger team_charters_stamp before insert or update on public.team_charters
  for each row execute function public.stamp_team_charter();

-- A new or changed charter: the writer has agreed to it, everyone else is asked again and notified.
create function public.on_team_charter_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  writer text;
begin
  if tg_op = 'UPDATE' and (new.roles, new.meetings, new.missed_work, new.communication)
     is not distinct from (old.roles, old.meetings, old.missed_work, old.communication) then
    return new;
  end if;
  delete from public.charter_agreements where team_id = new.team_id and user_id is distinct from new.updated_by;
  if new.updated_by is not null then
    insert into public.charter_agreements (team_id, user_id) values (new.team_id, new.updated_by)
      on conflict (team_id, user_id) do update set agreed_at = now();
  end if;
  select name into writer from public.users where id = new.updated_by;
  insert into public.notifications (user_id, type, title, body, link)
  select m.user_id, 'system',
         coalesce(writer, 'A teammate') || case when tg_op = 'INSERT' then ' wrote your team charter' else ' changed your team charter' end,
         'Read it and agree, or suggest changes, so everyone knows what to expect.',
         '/student?team=' || new.team_id || '&charter=1'
  from public.team_members m where m.team_id = new.team_id and m.user_id is distinct from new.updated_by;
  return new;
end $$;
create trigger team_charters_notify after insert or update on public.team_charters
  for each row execute function public.on_team_charter_changed();

alter publication supabase_realtime add table public.team_charters, public.charter_agreements;
