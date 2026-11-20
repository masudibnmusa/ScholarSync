-- Checklists on tasks: small steps inside one board card. Team members edit them, the instructor can read them.
create table public.task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 200),
  done       boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index task_checklist_task_idx on public.task_checklist_items (task_id, position);

alter table public.task_checklist_items enable row level security;
create policy checklist_select on public.task_checklist_items for select
  using (public.can_view_team(public.task_team(task_id)));
create policy checklist_insert on public.task_checklist_items for insert
  with check (public.is_team_member(public.task_team(task_id)));
create policy checklist_update on public.task_checklist_items for update
  using (public.is_team_member(public.task_team(task_id)))
  with check (public.is_team_member(public.task_team(task_id)));
create policy checklist_delete on public.task_checklist_items for delete
  using (public.is_team_member(public.task_team(task_id)));
