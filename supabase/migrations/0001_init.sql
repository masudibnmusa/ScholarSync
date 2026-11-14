-- CampusNova core schema (Supabase / Postgres 15+)
-- Access control lives here as RLS, so API code never re-implements "is this user allowed?" checks.

-- ─── Enums ──────────────────────────────────────────────────────────────
create type public.user_role         as enum ('student', 'instructor');
create type public.task_status       as enum ('todo', 'in_progress', 'done');
create type public.task_priority     as enum ('low', 'medium', 'high');
create type public.alert_severity    as enum ('low', 'medium', 'high');
create type public.notification_type as enum ('task', 'message', 'review', 'conflict', 'system');
create type public.suggestion_status as enum ('pending', 'accepted', 'dismissed');

-- ─── Tables ─────────────────────────────────────────────────────────────
-- One row per auth user. Profile fields live here (1:1, no separate table needed).
create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  email        text not null unique,
  role         public.user_role not null default 'student',
  bio          text not null default '',
  skills       text[] not null default '{}',
  availability text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,                 -- e.g. CSE-3200
  title         text not null,
  term          text not null,                 -- e.g. Fall 2026
  instructor_id uuid not null references public.users (id) on delete restrict,
  created_at    timestamptz not null default now(),
  unique (code, term)
);

-- Students enrolled in a course: the pool AI matching builds teams from.
create table public.course_enrollments (
  course_id   uuid not null references public.courses (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses (id) on delete cascade,
  name         text not null,
  description  text not null default '',
  health_score smallint check (health_score between 0 and 100),  -- written by AI job
  created_at   timestamptz not null default now(),
  unique (course_id, name)
);

create table public.team_members (
  team_id   uuid not null references public.teams (id) on delete cascade,
  user_id   uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  description text not null default '',
  status      public.task_status not null default 'todo',
  priority    public.task_priority not null default 'medium',
  position    double precision not null default 0,  -- kanban order within a column
  assignee_id uuid references public.users (id) on delete set null,
  created_by  uuid references public.users (id) on delete set null default auth.uid(),
  due_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.files (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  uploader_id  uuid references public.users (id) on delete set null default auth.uid(),
  name         text not null,
  storage_path text not null unique,  -- "<team_id>/<uuid>-<name>" in bucket team-files
  size_bytes   bigint not null check (size_bytes >= 0),
  mime_type    text not null,
  created_at   timestamptz not null default now()
);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  sender_id  uuid references public.users (id) on delete set null default auth.uid(),
  content    text not null default '',
  file_id    uuid references public.files (id) on delete set null,
  created_at timestamptz not null default now(),
  check (length(trim(content)) > 0 or file_id is not null)
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  type       public.notification_type not null,
  title      text not null,
  body       text not null default '',
  link       text,                    -- in-app route, e.g. /student/tasks
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create table public.peer_reviews (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams (id) on delete cascade,
  reviewer_id      uuid not null references public.users (id) on delete cascade default auth.uid(),
  reviewee_id      uuid not null references public.users (id) on delete cascade,
  rating           smallint not null check (rating between 1 and 5),
  category_ratings jsonb not null default '{}',  -- {"communication":4,"quality":5,...}
  feedback         text not null default '',
  created_at       timestamptz not null default now(),
  unique (team_id, reviewer_id, reviewee_id),
  check (reviewer_id <> reviewee_id)
);

create table public.conflict_alerts (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  severity    public.alert_severity not null,
  summary     text not null,
  sentiment   numeric(4,3) not null check (sentiment between -1 and 1),
  resolved_at timestamptz,
  resolved_by uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Tasks the AI extracted from chat, waiting for a member to accept or dismiss.
create table public.task_suggestions (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams (id) on delete cascade,
  source_message_id uuid references public.messages (id) on delete set null,
  title             text not null,
  description       text not null default '',
  status            public.suggestion_status not null default 'pending',
  created_at        timestamptz not null default now()
);

-- ─── Indexes (match the app's hot queries) ──────────────────────────────
create index on public.team_members (user_id);
create index on public.course_enrollments (user_id);
create index on public.teams (course_id);
create index on public.tasks (team_id, status, position);
create index on public.tasks (assignee_id);
create index on public.messages (team_id, created_at desc);
create index on public.files (team_id, created_at desc);
create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id) where read_at is null;
create index on public.peer_reviews (team_id);
create index on public.conflict_alerts (team_id) where resolved_at is null;
create index on public.task_suggestions (team_id) where status = 'pending';

-- ─── Triggers ───────────────────────────────────────────────────────────
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Sign-up creates the profile row. Role is always 'student': a user must never pick
-- 'instructor' for themselves. Instructors are promoted by an admin (service role).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, name, email)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
          new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Access helpers (security definer avoids RLS recursion) ─────────────
create function public.is_instructor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'instructor')
$$;

create function public.is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where team_id = t and user_id = auth.uid())
$$;

create function public.teaches_team(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teams tm join public.courses c on c.id = tm.course_id
                 where tm.id = t and c.instructor_id = auth.uid())
$$;

create function public.teaches_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses where id = c and instructor_id = auth.uid())
$$;

create function public.is_enrolled(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.course_enrollments where course_id = c and user_id = auth.uid())
$$;

create function public.can_view_team(t uuid) returns boolean
language sql stable as $$ select public.is_team_member(t) or public.teaches_team(t) $$;

-- Users who share a team or course with me (so I can see their names/skills).
create function public.shares_context(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select u = auth.uid()
      or exists (select 1 from public.team_members a join public.team_members b using (team_id)
                 where a.user_id = auth.uid() and b.user_id = u)
      or exists (select 1 from public.courses c join public.course_enrollments e on e.course_id = c.id
                 where c.instructor_id = auth.uid() and e.user_id = u)
      or exists (select 1 from public.team_members m join public.teams t on t.id = m.team_id
                 join public.courses c on c.id = t.course_id
                 where c.instructor_id = auth.uid() and m.user_id = u)
      or exists (select 1 from public.course_enrollments e join public.courses c on c.id = e.course_id
                 where e.user_id = auth.uid() and c.instructor_id = u)
$$;

-- ─── Row-Level Security ─────────────────────────────────────────────────
alter table public.users              enable row level security;
alter table public.courses            enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.teams              enable row level security;
alter table public.team_members       enable row level security;
alter table public.tasks              enable row level security;
alter table public.files              enable row level security;
alter table public.messages           enable row level security;
alter table public.notifications      enable row level security;
alter table public.peer_reviews       enable row level security;
alter table public.conflict_alerts    enable row level security;
alter table public.task_suggestions   enable row level security;

-- users: see people you work with; edit only your own profile fields (never role/email).
create policy users_select on public.users for select using (public.shares_context(id));
create policy users_update on public.users for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.users from authenticated, anon;
grant update (name, bio, skills, availability) on public.users to authenticated;

-- courses / enrollments / teams / members: instructors manage their own courses.
create policy courses_select on public.courses for select
  using (instructor_id = auth.uid() or public.is_enrolled(id));
create policy courses_write on public.courses for all
  using (instructor_id = auth.uid()) with check (instructor_id = auth.uid() and public.is_instructor());

create policy enroll_select on public.course_enrollments for select
  using (user_id = auth.uid() or public.teaches_course(course_id));
create policy enroll_write on public.course_enrollments for all
  using (public.teaches_course(course_id)) with check (public.teaches_course(course_id));

create policy teams_select on public.teams for select using (public.can_view_team(id));
create policy teams_write on public.teams for all
  using (public.teaches_course(course_id)) with check (public.teaches_course(course_id));

create policy members_select on public.team_members for select using (public.can_view_team(team_id));
create policy members_write on public.team_members for all
  using (public.teaches_team(team_id)) with check (public.teaches_team(team_id));

-- tasks: any member works the board; instructors read.
create policy tasks_select on public.tasks for select using (public.can_view_team(team_id));
create policy tasks_insert on public.tasks for insert with check (public.is_team_member(team_id));
create policy tasks_update on public.tasks for update
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy tasks_delete on public.tasks for delete using (public.is_team_member(team_id));

-- files & messages: members post as themselves; instructors read.
create policy files_select on public.files for select using (public.can_view_team(team_id));
create policy files_insert on public.files for insert
  with check (public.is_team_member(team_id) and uploader_id = auth.uid());
create policy files_delete on public.files for delete using (uploader_id = auth.uid());

create policy messages_select on public.messages for select using (public.can_view_team(team_id));
create policy messages_insert on public.messages for insert
  with check (public.is_team_member(team_id) and sender_id = auth.uid());

-- notifications: private to the owner; created by server jobs (service role bypasses RLS).
create policy notif_select on public.notifications for select using (user_id = auth.uid());
create policy notif_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- peer reviews: reviewer writes about a teammate; reviewee never sees who wrote what.
create policy reviews_select on public.peer_reviews for select
  using (reviewer_id = auth.uid() or public.teaches_team(team_id));
create policy reviews_insert on public.peer_reviews for insert
  with check (reviewer_id = auth.uid() and public.is_team_member(team_id)
              and exists (select 1 from public.team_members m
                          where m.team_id = peer_reviews.team_id and m.user_id = reviewee_id));

-- conflict alerts: instructor-only; created by the AI job.
create policy alerts_select on public.conflict_alerts for select using (public.teaches_team(team_id));
create policy alerts_update on public.conflict_alerts for update
  using (public.teaches_team(team_id)) with check (public.teaches_team(team_id));

-- task suggestions: members review what the AI proposed.
create policy sugg_select on public.task_suggestions for select using (public.is_team_member(team_id));
create policy sugg_update on public.task_suggestions for update
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

-- ─── Read models ────────────────────────────────────────────────────────
-- security_invoker: the view obeys the caller's RLS, so it leaks nothing extra.
create view public.team_progress with (security_invoker = true) as
select t.id as team_id,
       count(k.id)                                   as total_tasks,
       count(k.id) filter (where k.status = 'done')  as done_tasks,
       coalesce(round(100.0 * count(k.id) filter (where k.status = 'done') / nullif(count(k.id), 0)), 0)::int
                                                     as progress_pct
from public.teams t left join public.tasks k on k.team_id = t.id
group by t.id;

create view public.member_contribution with (security_invoker = true) as
select m.team_id, m.user_id,
       count(k.id) filter (where k.status = 'done') as tasks_done,
       count(k.id)                                  as tasks_assigned
from public.team_members m
left join public.tasks k on k.team_id = m.team_id and k.assignee_id = m.user_id
group by m.team_id, m.user_id;

-- ─── Realtime ───────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.messages, public.tasks, public.notifications;

-- ─── Storage: private bucket, object path starts with the team id ──────
insert into storage.buckets (id, name, public) values ('team-files', 'team-files', false);

create policy team_files_read on storage.objects for select
  using (bucket_id = 'team-files' and public.can_view_team(((storage.foldername(name))[1])::uuid));
create policy team_files_upload on storage.objects for insert
  with check (bucket_id = 'team-files' and public.is_team_member(((storage.foldername(name))[1])::uuid));
create policy team_files_delete on storage.objects for delete
  using (bucket_id = 'team-files' and owner = auth.uid());
