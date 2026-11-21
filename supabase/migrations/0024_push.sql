-- Phone and desktop alerts (Web Push). Each browser that turns alerts on stores a subscription; a job sends the
-- important notifications to it and stamps pushed_at so nothing is sent twice.

create table public.push_subscriptions (
  endpoint   text primary key check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  user_id    uuid not null references public.users (id) on delete cascade default auth.uid(),
  p256dh     text not null check (length(p256dh) <= 200),
  auth       text not null check (length(auth) <= 100),
  user_agent text not null default '' check (length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy push_select on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_insert on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy push_update on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete using (user_id = auth.uid());

alter table public.notifications add column pushed_at timestamptz;
-- The sender scans recent, unsent notifications.
create index notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;
-- Everything before alerts existed is history, not news.
update public.notifications set pushed_at = created_at;
