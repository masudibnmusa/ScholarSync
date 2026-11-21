-- GitHub per team: a team links a repo, students add their GitHub username, and a job copies commits and pull requests
-- into repo_activity (polling the GitHub API; no webhook needed). Activity is matched to students by username when read.

alter table public.users add column github_login text
  check (github_login ~ '^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$');
grant update (github_login) on public.users to authenticated;

-- owner/name as GitHub spells them. Set through a Server Action (team members or the instructor).
alter table public.teams
  add column repo text check (repo ~ '^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$'),
  add column repo_synced_at timestamptz,
  add column repo_error text;

create table public.repo_activity (
  team_id      uuid not null references public.teams (id) on delete cascade,
  id           text not null,                    -- commit sha, or 'pr-<number>'
  kind         text not null check (kind in ('commit', 'pr')),
  github_login text,                             -- null: the commit's email isn't linked to a GitHub account
  author_name  text not null default '',
  title        text not null,
  url          text not null check (url like 'https://github.com/%'),
  state        text check (state in ('open', 'closed', 'merged')),  -- pull requests only
  at           timestamptz not null,
  primary key (team_id, id)
);
create index repo_activity_team_at on public.repo_activity (team_id, at desc);
alter table public.repo_activity enable row level security;
create policy repo_activity_select on public.repo_activity for select using (public.can_view_team(team_id));
-- Written by the sync job only (owner role).

alter publication supabase_realtime add table public.repo_activity;
