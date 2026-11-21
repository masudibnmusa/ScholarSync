-- Profile photos. The image lives in the public "avatars" bucket at "<user_id>/<uuid>.<ext>";
-- users.avatar_path points at it (null = show initials). A new file name on every upload busts caches.

alter table public.users add column avatar_path text
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$'));
grant update (avatar_path) on public.users to authenticated;

-- Public read: profile photos are shown to anyone who can see the person. 2 MB, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

-- Each user writes and deletes only inside their own folder. Storage's remove() looks the object up first, so delete needs select too.
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
