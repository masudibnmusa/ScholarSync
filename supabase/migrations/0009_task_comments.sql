-- Comments on tasks: a short thread on each board card, so discussion stays with the task.
create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid references public.users (id) on delete set null default auth.uid(),
  body       text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

-- Team id of a task, readable regardless of the caller's RLS (used by the policies below).
create function public.task_team(k uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select team_id from public.tasks where id = k
$$;

alter table public.task_comments enable row level security;

-- Members and the course instructor read and write; people delete only their own comments.
create policy comments_select on public.task_comments for select
  using (public.can_view_team(public.task_team(task_id)));
create policy comments_insert on public.task_comments for insert
  with check (author_id = auth.uid() and public.can_view_team(public.task_team(task_id)));
create policy comments_delete on public.task_comments for delete
  using (author_id = auth.uid());

-- Tell the task's assignee and creator (never the commenter), linking straight to the task.
create function public.on_task_comment_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  author text;
  k public.tasks;
begin
  select name into author from public.users where id = new.author_id;
  select * into k from public.tasks where id = new.task_id;
  insert into public.notifications (user_id, type, title, body, link)
  select distinct u, 'task'::public.notification_type,
         coalesce(author, 'A teammate') || ' commented on ' || k.title,
         left(new.body, 140),
         '/student?team=' || k.team_id || '&task=' || k.id
  from unnest(array[k.assignee_id, k.created_by]) as u
  where u is not null and u is distinct from new.author_id;
  return new;
end $$;
create trigger task_comments_notify after insert on public.task_comments
  for each row execute function public.on_task_comment_created();
