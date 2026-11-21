-- Live updates for every page: profile photos, courses, rosters, teams, files, task details, milestones and hand-ins,
-- announcements, reviews, recaps and grading. Realtime checks each subscriber's RLS before sending a row.
alter publication supabase_realtime add table
  public.users, public.courses, public.course_enrollments, public.teams, public.team_members, public.files,
  public.task_comments, public.task_checklist_items, public.course_announcements, public.course_milestones,
  public.team_milestones, public.submissions, public.peer_reviews, public.team_summaries, public.rubric_criteria,
  public.team_grades, public.student_grade_factors, public.conflict_alerts, public.task_suggestions;
