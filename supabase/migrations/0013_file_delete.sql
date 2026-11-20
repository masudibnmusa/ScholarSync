-- Deleting files: the uploader or the course instructor removes a file (row + stored object).

-- The instructor may delete files in their teams, matching team_files_delete_instructor on storage (0006).
create policy files_delete_instructor on public.files for delete using (public.teaches_team(team_id));

-- A chat message must have text or a file. Messages that only carried this file get a note before
-- messages.file_id is set to null, so the delete doesn't fail on that check.
create function public.on_file_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.messages
     set content = 'Shared "' || old.name || '" (deleted)'
   where file_id = old.id and length(trim(content)) = 0;
  return old;
end $$;
create trigger files_keep_messages before delete on public.files
  for each row execute function public.on_file_deleted();
