-- Daily email digest of unread notifications. Users can switch it off; each notification is emailed at most once.
alter table public.users add column email_digest boolean not null default true;
grant update (email_digest) on public.users to authenticated;

alter table public.notifications add column emailed_at timestamptz;
create index notifications_digest_idx on public.notifications (user_id, created_at)
  where read_at is null and emailed_at is null;
