-- Task history: who created a task and who changed its status, assignee, due date, priority or title.
-- Written only by the trigger below; readable by whoever can see the team.
create table public.task_events (
  id         bigint generated always as identity primary key,
  task_id    uuid not null references public.tasks (id) on delete cascade,
  actor_id   uuid references public.users (id) on delete set null,
  field      text not null check (field in ('created', 'status', 'assignee', 'due_date', 'priority', 'title')),
  old_value  text,
  new_value  text,
  created_at timestamptz not null default now()
);
create index task_events_task_idx on public.task_events (task_id, created_at);

alter table public.task_events enable row level security;
create policy task_events_select on public.task_events for select
  using (public.can_view_team(public.task_team(task_id)));

create function public.log_task_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); -- null when a background job made the change
  name_of_old text;
  name_of_new text;
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, actor_id, field, new_value) values (new.id, actor, 'created', new.title);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.task_events (task_id, actor_id, field, old_value, new_value) values (new.id, actor, 'status', old.status::text, new.status::text);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    select name into name_of_old from public.users where id = old.assignee_id;
    select name into name_of_new from public.users where id = new.assignee_id;
    insert into public.task_events (task_id, actor_id, field, old_value, new_value) values (new.id, actor, 'assignee', name_of_old, name_of_new);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.task_events (task_id, actor_id, field, old_value, new_value) values (new.id, actor, 'due_date', old.due_date::text, new.due_date::text);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.task_events (task_id, actor_id, field, old_value, new_value) values (new.id, actor, 'priority', old.priority::text, new.priority::text);
  end if;
  if new.title is distinct from old.title then
    insert into public.task_events (task_id, actor_id, field, old_value, new_value) values (new.id, actor, 'title', old.title, new.title);
  end if;
  return new;
end $$;
create trigger tasks_log_events after insert or update on public.tasks
  for each row execute function public.log_task_event();
