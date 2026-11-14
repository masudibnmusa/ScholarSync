-- Local demo data. Applied by `supabase db reset`. Every account's password is: password123
-- Never run this against production.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
       crypt('password123', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(), '', '', '', ''
from (values
  ('00000000-0000-4000-8000-000000000001', 'selim.reja@university.edu', 'Selim Reja'),
  ('00000000-0000-4000-8000-000000000011', 'masud@university.edu',      'Masud Ibn Musa'),
  ('00000000-0000-4000-8000-000000000012', 'nazmul@university.edu',     'Md Nazmul Hasan'),
  ('00000000-0000-4000-8000-000000000013', 'chinmoy@university.edu',    'Chinmoy Kumar'),
  ('00000000-0000-4000-8000-000000000014', 'sara@university.edu',       'Sara Islam'),
  ('00000000-0000-4000-8000-000000000015', 'rahim@university.edu',      'Rahim Uddin'),
  ('00000000-0000-4000-8000-000000000016', 'fatima@university.edu',     'Fatima Akter')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email', jsonb_build_object('sub', id::text, 'email', email), now(), now(), now()
from auth.users where email like '%@university.edu';

-- Instructors are promoted by an admin; sign-up always creates students.
update public.users set role = 'instructor' where email = 'selim.reja@university.edu';

update public.users set skills = s.skills, availability = s.avail, bio = s.bio
from (values
  ('masud@university.edu',   array['React','TypeScript','UI design'], 'Weekday evenings', 'Frontend lead.'),
  ('nazmul@university.edu',  array['Python','PostgreSQL','APIs'],     'Weekends',         'Backend and data.'),
  ('chinmoy@university.edu', array['Testing','DevOps','Docker'],      'Mornings',         'Keeps CI green.'),
  ('sara@university.edu',    array['Figma','UX research'],            'Afternoons',       'Design and user interviews.'),
  ('rahim@university.edu',   array['Java','Algorithms'],              'Weekday evenings', 'Algorithms nerd.'),
  ('fatima@university.edu',  array['Writing','Project management'],   'Flexible',         'Docs and planning.')
) as s(email, skills, avail, bio)
where users.email = s.email;

insert into public.courses (id, code, title, term, instructor_id) values
  ('00000000-0000-4000-9000-000000000001', 'CSE-3200', 'Software Engineering Project', 'Fall 2026',
   '00000000-0000-4000-8000-000000000001');

insert into public.course_enrollments (course_id, user_id)
select '00000000-0000-4000-9000-000000000001', id from public.users where role = 'student';

insert into public.teams (id, course_id, name, description, health_score) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-9000-000000000001', 'Team Nova',  'Campus event finder app', 82),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-9000-000000000001', 'Team Orbit', 'Study group scheduler',   64);

insert into public.team_members (team_id, user_id) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-8000-000000000013'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-8000-000000000014'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-8000-000000000015'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-8000-000000000016');

insert into public.tasks (team_id, title, description, status, priority, position, assignee_id, created_by, due_date) values
  ('00000000-0000-4000-a000-000000000001', 'Set up Next.js project', 'Repo, lint, CI', 'done', 'high', 1,
   '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011', current_date - 7),
  ('00000000-0000-4000-a000-000000000001', 'Design database schema', 'Events, users, RSVPs', 'done', 'high', 2,
   '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000011', current_date - 3),
  ('00000000-0000-4000-a000-000000000001', 'Build event list page', '', 'in_progress', 'medium', 3,
   '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012', current_date + 4),
  ('00000000-0000-4000-a000-000000000001', 'Write integration tests', '', 'todo', 'medium', 4,
   '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000011', current_date + 10),
  ('00000000-0000-4000-a000-000000000002', 'User interviews', 'Five students', 'in_progress', 'high', 1,
   '00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000016', current_date + 2),
  ('00000000-0000-4000-a000-000000000002', 'Scheduling algorithm draft', '', 'todo', 'high', 2,
   '00000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000016', current_date + 6);

insert into public.messages (team_id, sender_id, content, created_at) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-8000-000000000011', 'Hi team! Repo is set up, check the README.', now() - interval '2 days'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-8000-000000000012', 'Schema is done. I can start on the API next.', now() - interval '1 day'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-8000-000000000013', 'I will write the tests once the event list page lands.', now() - interval '3 hours'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-8000-000000000014', 'Interviews booked for Thursday.', now() - interval '1 day'),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-8000-000000000015', 'I still have not got the requirements doc...', now() - interval '5 hours');
