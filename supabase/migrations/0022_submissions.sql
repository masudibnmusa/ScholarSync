-- Assignment submissions: a milestone can ask teams to hand in work (a file, a link, or both, plus a note).
-- One submission per team per milestone; handing in again replaces it. The instructor leaves written feedback.
-- Marks stay in the rubric grading (0012); this is the hand-in and the comments on it.

alter table public.course_milestones add column requires_submission boolean not null default false;

create table public.submissions (
  team_id      uuid not null references public.teams (id) on delete cascade,
  milestone_id uuid not null references public.course_milestones (id) on delete cascade,
  link         text check (link is null or (link ~* '^https?://' and length(link) <= 2000)),
  storage_path text,                                   -- in the team-files bucket, under "<team_id>/submissions/"
  file_name    text check (length(file_name) <= 255),
  file_size    bigint check (file_size >= 0),
  note         text not null default '' check (length(note) <= 2000),
  submitted_by uuid references public.users (id) on delete set null,
  submitted_at timestamptz not null default now(),
  feedback     text not null default '' check (length(feedback) <= 4000),
  feedback_by  uuid references public.users (id) on delete set null,
  feedback_at  timestamptz,
  primary key (team_id, milestone_id),
  check (link is not null or storage_path is not null),
  check (storage_path is null or (storage_path like team_id::text || '/submissions/%' and file_name is not null))
);
create index submissions_milestone_idx on public.submissions (milestone_id);

create function public.milestone_takes_submissions(m uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select requires_submission from public.course_milestones where id = m), false)
$$;

alter table public.submissions enable row level security;
create policy submissions_select on public.submissions for select using (public.can_view_team(team_id));
create policy submissions_insert on public.submissions for insert
  with check (public.is_team_member(team_id) and public.milestone_in_team_course(milestone_id, team_id)
              and public.milestone_takes_submissions(milestone_id));
-- Both the team (resubmitting) and the instructor (feedback) update; the trigger below decides which columns each may change.
create policy submissions_update on public.submissions for update
  using (public.can_view_team(team_id)) with check (public.can_view_team(team_id));

-- The team owns the hand-in columns and the instructor owns the feedback columns, whatever a client sends.
-- Archived courses: the team can't hand in, the instructor can still give feedback (grading keeps working).
create function public.guard_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then return new; end if;
  if public.teaches_team(new.team_id) then
    if tg_op = 'INSERT' then raise exception 'Only the team can hand in work'; end if;
    new.link := old.link; new.storage_path := old.storage_path; new.file_name := old.file_name; new.file_size := old.file_size;
    new.note := old.note; new.submitted_by := old.submitted_by; new.submitted_at := old.submitted_at;
    new.feedback_by := auth.uid(); new.feedback_at := now();
  else
    if exists (select 1 from public.teams t join public.courses c on c.id = t.course_id where t.id = new.team_id and c.archived_at is not null) then
      raise exception 'This course is archived and read-only' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' then
      new.feedback := old.feedback; new.feedback_by := old.feedback_by; new.feedback_at := old.feedback_at;
    else
      new.feedback := ''; new.feedback_by := null; new.feedback_at := null;
    end if;
    new.submitted_by := auth.uid(); new.submitted_at := now();
  end if;
  return new;
end $$;
create trigger submissions_guard before insert or update on public.submissions
  for each row execute function public.guard_submission();

-- Hand-in: tell the instructor. Feedback: tell the team.
create function public.on_submission_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  team_name text; course uuid; teacher uuid; ms_title text;
begin
  select t.name, t.course_id, c.instructor_id, m.title into team_name, course, teacher, ms_title
  from public.teams t join public.courses c on c.id = t.course_id join public.course_milestones m on m.id = new.milestone_id
  where t.id = new.team_id;
  if tg_op = 'INSERT' or new.submitted_at is distinct from old.submitted_at then
    perform public.notify(teacher, 'task', team_name || (case when tg_op = 'INSERT' then ' handed in ' else ' resubmitted ' end) || ms_title,
      coalesce(nullif(new.note, ''), coalesce(new.file_name, new.link)), '/instructor/courses/' || course);
  end if;
  if tg_op = 'UPDATE' and new.feedback_at is distinct from old.feedback_at and new.feedback <> '' then
    insert into public.notifications (user_id, type, title, body, link)
    select m.user_id, 'review', 'Feedback on ' || ms_title, left(new.feedback, 200), '/student/courses/' || course
    from public.team_members m where m.team_id = new.team_id;
  end if;
  return new;
end $$;
create trigger submissions_notify after insert or update on public.submissions
  for each row execute function public.on_submission_changed();
