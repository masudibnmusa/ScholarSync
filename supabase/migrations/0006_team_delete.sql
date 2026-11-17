-- Instructors can delete the stored files of teams they teach, so deleting a team (or course) leaves no orphaned uploads.
create policy team_files_delete_instructor on storage.objects for delete
  using (bucket_id = 'team-files' and public.teaches_team(((storage.foldername(name))[1])::uuid));
