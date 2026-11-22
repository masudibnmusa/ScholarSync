-- Interface language per user, so emails and reminders can be written in it too. The browser keeps a "lang" cookie
-- for the pages themselves (it also covers sign-in, before anyone is known).
alter table public.users add column locale text not null default 'en' check (locale in ('en', 'bn'));
grant update (locale) on public.users to authenticated;
