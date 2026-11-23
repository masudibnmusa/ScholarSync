-- Task dependencies: "blocked by" links between tasks of one team. The board greys out a task while any task it waits
-- on is unfinished, and when the last one is done the waiting task's assignee is told it's ready.

create table public.task_dependencies (
  task_id    uuid not null references public.tasks (id) on delete cascade, -- the task that waits
  blocked_by uuid not null references public.tasks (id) on delete cascade, -- the task it waits on
  team_id    uuid not null references public.teams (id) on delete cascade, -- both tasks' team, for RLS and the archive lock
  created_by uuid default auth.uid() references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, blocked_by),
  check (task_id <> blocked_by)
);
create index task_dependencies_blocker_idx on public.task_dependencies (blocked_by);
create index task_dependencies_team_idx on public.task_dependencies (team_id);

alter table public.task_dependencies enable row level security;
create policy dependencies_select on public.task_dependencies for select using (public.can_view_team(team_id));
create policy dependencies_insert on public.task_dependencies for insert
  with check (public.is_team_member(team_id) and public.task_team(task_id) = team_id and public.task_team(blocked_by) = team_id);
create policy dependencies_delete on public.task_dependencies for delete using (public.is_team_member(team_id));
grant select, insert, delete on public.task_dependencies to authenticated;

-- No loops: the new blocker can't already (directly or through others) wait on this task.
create function public.guard_task_dependency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    with recursive waits (id) as (
      select blocked_by from public.task_dependencies where task_id = new.blocked_by
      union
      select d.blocked_by from public.task_dependencies d join waits w on d.task_id = w.id
    )
    select 1 from waits where id = new.task_id
  ) or new.blocked_by = new.task_id then
    raise exception 'That would make the tasks wait on each other' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger task_dependencies_guard before insert on public.task_dependencies
  for each row execute function public.guard_task_dependency();
create trigger task_dependencies_archived before insert or delete on public.task_dependencies
  for each row execute function public.block_archived_course();

-- A task is done: each task that waited on it and now waits on nothing unfinished is ready; tell its assignee
-- (unless they finished it themselves).
create function public.on_blocker_done() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select w.assignee_id, 'task', 'Ready to start: ' || w.title, new.title || ' is done.',
         '/student?team=' || w.team_id || '&task=' || w.id
  from public.task_dependencies d
  join public.tasks w on w.id = d.task_id
  where d.blocked_by = new.id and w.status <> 'done' and w.assignee_id is not null
    and w.assignee_id is distinct from auth.uid()
    and not exists (select 1 from public.task_dependencies o join public.tasks b on b.id = o.blocked_by
                    where o.task_id = w.id and b.status <> 'done');
  return new;
end $$;
create trigger tasks_unblock after update of status on public.tasks
  for each row when (new.status = 'done' and old.status is distinct from 'done')
  execute function public.on_blocker_done();

alter publication supabase_realtime add table public.task_dependencies;
