-- Peer help board: a student asks the course a question, anyone in the course answers, and the asker marks the answer
-- that solved it. Solved answers count in the answerer's contribution report.
create table public.help_questions (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  author_id   uuid references public.users (id) on delete set null default auth.uid(),
  title       text not null check (length(trim(title)) between 1 and 160),
  body        text not null default '' check (length(body) <= 4000),
  solved_by   uuid,                                       -- the answer that solved it
  created_at  timestamptz not null default now()
);
create index help_questions_course_idx on public.help_questions (course_id, created_at desc);

create table public.help_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.help_questions (id) on delete cascade,
  author_id   uuid references public.users (id) on delete set null default auth.uid(),
  body        text not null check (length(trim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index help_answers_question_idx on public.help_answers (question_id, created_at);
alter table public.help_questions add constraint help_questions_solved_fk
  foreign key (solved_by) references public.help_answers (id) on delete set null;

create function public.in_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_enrolled(c) or public.teaches_course(c)
$$;
create function public.question_course(q uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select course_id from public.help_questions where id = q
$$;

alter table public.help_questions enable row level security;
alter table public.help_answers enable row level security;
create policy help_q_select on public.help_questions for select using (public.in_course(course_id));
create policy help_q_insert on public.help_questions for insert with check (public.is_enrolled(course_id) and author_id = auth.uid());
-- The asker marks the solution (only that column, see the grant); the asker or the instructor removes a question.
create policy help_q_update on public.help_questions for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy help_q_delete on public.help_questions for delete using (author_id = auth.uid() or public.teaches_course(course_id));
create policy help_a_select on public.help_answers for select using (public.in_course(public.question_course(question_id)));
create policy help_a_insert on public.help_answers for insert with check (public.in_course(public.question_course(question_id)) and author_id = auth.uid());
create policy help_a_delete on public.help_answers for delete using (author_id = auth.uid() or public.teaches_course(public.question_course(question_id)));
grant select, insert, delete on public.help_questions, public.help_answers to authenticated;
-- Supabase grants every table to authenticated by default; take update back so only the solution can change.
revoke update on public.help_questions, public.help_answers from authenticated, anon;
grant update (solved_by) on public.help_questions to authenticated;

-- The solution must be an answer to this question, and archived courses are read-only.
create function public.guard_help() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c uuid;
begin
  -- Each table's own column: a CASE would make PL/pgSQL look up both on either table.
  if tg_table_name = 'help_questions' then c := new.course_id; else c := public.question_course(new.question_id); end if;
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and exists (select 1 from public.courses where id = c and archived_at is not null) then
    raise exception 'This course is archived and read-only' using errcode = 'P0001';
  end if;
  if tg_table_name = 'help_questions' then
    if new.solved_by is not null and not exists (select 1 from public.help_answers where id = new.solved_by and question_id = new.id) then
      raise exception 'That answer belongs to another question' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger help_q_guard before insert or update on public.help_questions for each row execute function public.guard_help();
create trigger help_a_guard before insert on public.help_answers for each row execute function public.guard_help();

-- The course page for the recipient's role (instructors answer too), opened at the question.
create function public.help_link(u uuid, c uuid, q uuid) returns text
language sql stable security definer set search_path = '' as $$
  select '/' || (select role::text from public.users where id = u) || '/courses/' || c || '?help=' || q
$$;

-- A new answer tells the asker; a solution tells the person who answered.
create function public.on_help_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare q public.help_questions; who text; ans_author uuid;
begin
  if tg_table_name = 'help_answers' then
    select * into q from public.help_questions where id = new.question_id;
    select name into who from public.users where id = new.author_id;
    if q.author_id is not null and q.author_id is distinct from new.author_id then
      perform public.notify(q.author_id, 'message', coalesce(who, 'A classmate') || ' answered your question: ' || q.title,
        left(new.body, 200), public.help_link(q.author_id, q.course_id, q.id));
    end if;
  elsif new.solved_by is distinct from old.solved_by and new.solved_by is not null then
    select author_id into ans_author from public.help_answers where id = new.solved_by;
    if ans_author is not null and ans_author is distinct from new.author_id then
      perform public.notify(ans_author, 'review', 'Your answer solved a question: ' || new.title, '',
        public.help_link(ans_author, new.course_id, new.id));
    end if;
  end if;
  return new;
end $$;
create trigger help_a_notify after insert on public.help_answers for each row execute function public.on_help_changed();
create trigger help_q_notify after update on public.help_questions for each row execute function public.on_help_changed();

alter publication supabase_realtime add table public.help_questions, public.help_answers;
