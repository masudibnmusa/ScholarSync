-- Announcements: the instructor posts to everyone in a course; enrolled students are notified.
create table public.course_announcements (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  author_id  uuid references public.users (id) on delete set null default auth.uid(),
  title      text not null check (length(trim(title)) between 1 and 120),
  body       text not null default '' check (length(body) <= 4000),
  created_at timestamptz not null default now()
);
create index course_announcements_course_idx on public.course_announcements (course_id, created_at desc);

alter table public.course_announcements enable row level security;
create policy announcements_select on public.course_announcements for select
  using (public.teaches_course(course_id) or public.is_enrolled(course_id));
create policy announcements_insert on public.course_announcements for insert
  with check (public.teaches_course(course_id) and author_id = auth.uid());
create policy announcements_delete on public.course_announcements for delete
  using (public.teaches_course(course_id));

create function public.on_announcement_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select e.user_id, 'system', c.code || ': ' || new.title, left(new.body, 140), '/student/courses/' || new.course_id
  from public.course_enrollments e join public.courses c on c.id = e.course_id
  where e.course_id = new.course_id;
  return new;
end $$;
create trigger announcements_notify after insert on public.course_announcements
  for each row execute function public.on_announcement_created();
