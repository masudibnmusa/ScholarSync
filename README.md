# ScholarSync

A collaboration hub for university group projects. Students work in teams with chat, a Kanban board, shared files and peer reviews. Instructors oversee every team in their courses through analytics, conflict alerts and AI-assisted team matching.

> **Status:** the Supabase backend is implemented: auth, teams, tasks, chat (Realtime), files (Storage), notifications, peer review, conflict alerts, and the AI jobs. See [Implementation notes](#implementation-notes) for where the code differs from the diagram.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, Radix primitives, Phosphor icons, Framer Motion, dnd-kit, cmdk |
| State | Zustand store in the browser: calls Server Actions, subscribes to Realtime |
| Backend | Supabase: Postgres, Auth, Realtime, Storage |
| Data access | Drizzle ORM, zod validation |
| AI | Google Gen AI (Gemini), run as background jobs (Inngest) |
| Hosting | Vercel + Supabase |

## System architecture

![ScholarSync system architecture: browser, Next.js server, Supabase and AI jobs](docs/system-architecture.svg)

Colors are the app's design tokens from [`src/app/globals.css`](src/app/globals.css), defined in three layers inside the SVG (primitive → semantic → component). It always renders in the light theme.

### How a request works

1. The browser opens a page such as `/student/tasks`, and the store calls a Server Action. The action queries Postgres **as the signed-in user** through `withUser()` in [`src/db/index.ts`](src/db/index.ts): Drizzle connects as a role that bypasses RLS, so each query runs in a transaction that first sets `role = authenticated` and `request.jwt.claims` from the verified session. Never query with `adminDb` from a user request.
2. Postgres **Row-Level Security** (RLS) returns only the rows that user may see. Access rules live in the database, not in API code.
3. On sign-up, the `on_auth_user_created` trigger creates the matching `public.users` row (always as a student).
4. Changes go through **Server Actions**, which validate input with zod and write with Drizzle. RLS checks every write too.
5. **Realtime** pushes inserts and updates on `messages`, `tasks` and `notifications` to every open client.
6. **AI jobs** react to new data (new messages, nightly runs) and write their results back as rows: `task_suggestions`, `conflict_alerts`, `teams.health_score`. A person accepts or resolves each one.

## Database architecture

Every row belongs to a **course** or a **team**, and the access rules follow that ownership. Profile fields live on `users` because they are one-to-one with the account. Progress and contribution are computed in **views** rather than stored, so they can't drift out of date.

![ScholarSync database architecture: 12 tables, 2 views and 6 enums, grouped by people & courses, teams, team work and AI output](docs/database-architecture.svg)

Lines connect each parent's primary key to the child's foreign key column. Foreign keys to `users` are shown as blue `uuid → users` labels instead of lines, so the diagram stays readable. Colors use the same tokens as the system diagram.

### Views

| View | Purpose |
|---|---|
| `team_progress` | Done and total tasks per team, as a percentage |
| `member_contribution` | Tasks done and assigned per member |

Both views use `security_invoker = true`, so they follow the caller's access rules and show nothing extra.

### Access rules (RLS)

| Table | Team member | Course instructor | Anyone else |
|---|---|---|---|
| `tasks` | read, write | read | none |
| `messages` | read, post as self | read | none |
| `files` + storage | read, upload, delete own | read | none |
| `peer_reviews` | write about teammates, read own | read all | none (the reviewee can't see them either) |
| `conflict_alerts` | none | read, resolve | none |
| `teams`, `team_members` | read | read, write | none |
| `users` | edit own profile | read their students | teammates only |
| `notifications` | owner only | owner only | owner only |

- `users.role` and `users.email` can't be changed by any client (column-level grants).
- Sign-up always creates a **student**. Instructors are promoted by an admin using the service role.
- Background jobs use the service role and bypass RLS.

### Indexes

They match the app's most frequent queries: tasks by team and status, messages by team ordered by time, unread notifications per user, open conflict alerts, and pending task suggestions.

## Project structure

```
src/
  app/actions.ts        Server Actions: every read and write, zod-validated, run as the user (RLS)
  app/api/inngest/      Inngest endpoint for the AI jobs
  app/page.tsx          Landing page (static)
  app/(auth)/           /login and /register; signed-in users are redirected to their home
  app/(app)/            Signed-in app: layout checks the session, then /student/* and /instructor/* (role-checked).
                        /student and /instructor are the workspaces; old /student/chat|tasks|files and /instructor/teams redirect there
  app/globals.css       Design tokens (light + dark): indigo (#373063) brand, orange accent, validated chart palette
  db/schema.ts          Drizzle schema (mirrors the SQL migrations)
  db/index.ts           withUser(): runs queries as the signed-in user; adminDb for jobs only
  inngest/              Background jobs: task extraction, nightly team health
  lib/ai.ts             Gemini calls (JSON schema output, chat treated as untrusted data)
  lib/supabase/         Browser and server Supabase clients
  lib/store.ts          Client state; calls Server Actions, subscribes to Realtime
  lib/session.ts        Signed-in profile for server layouts (cached per request)
  proxy.ts              Refreshes the session cookie on each request
  components/ui/        Primitives: button, dialog, select, segmented control, progress, motion helpers
  components/app/       Shell: icon rail (desktop), top bar + tab bar (phones), command menu (Ctrl/Cmd+K), notifications, profile
  components/student/   Workspace (board + docked chat + files drawer), and the TaskBoard/ChatThread/FilesView pieces it uses; peer review
  components/instructor/ Workspace (team list, read-only board, chat/files/alerts dock), analytics, conflicts, AI matching
  components/landing/   Landing page and its interactive product demo
  components/auth/      Sign-in / sign-up
supabase/
  migrations/           0001 schema, RLS, views, storage · 0002 notification triggers
  seed.sql              Local demo data
docs/                   Architecture diagrams (SVG)
```

## Getting started

Requires Node 20+ and Docker. The Supabase CLI is a dev dependency.

```bash
npm install
npx supabase start                 # local Postgres, Auth, Realtime, Storage
npx supabase db reset              # applies migrations + seed.sql
cp .env.example .env.local         # fill in the values printed by `supabase start`
npm run dev                        # http://localhost:3000
npx inngest-cli@latest dev         # optional: runs the AI jobs locally (needs GEMINI_API_KEY)
```

**After the first setup**, start working with Docker running:

```bash
npx supabase start
npm run dev
```

Stop with `Ctrl+C` for the dev server and `npx supabase stop` for Supabase. Local data is kept between runs.

`.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key), `DATABASE_URL` (the DB URL; use the transaction pooler in production) and `GEMINI_API_KEY` (from Google AI Studio). `DATABASE_URL` and `GEMINI_API_KEY` are server-only.

**Demo accounts** (seed, password `password123`): instructor `selim.reja@university.edu`; students `masud@`, `nazmul@`, `chinmoy@` (Team Nova) and `sara@`, `rahim@`, `fatima@` (Team Orbit), all `@university.edu`.

## Implementation notes

Where the code differs from the diagram, and why:

- **Routes with a client store.** Each screen is a real route (`/student/chat`, `/instructor/teams?team=<id>`, …), guarded by server layouts that check the session and the role. The screens themselves are Client Components: data is loaded by Server Actions called from the Zustand store, which also holds the Realtime subscriptions. The access path is the same: Next.js server → Drizzle → Postgres as the user.
- **Peer reviews are write-only for students.** There is no "my reviews" query, so the UI remembers which teammates you reviewed in `localStorage`; the database's unique constraint still rejects a second review.
- **Events come from the Server Action.** `sendMessage` sends the Inngest event after the insert, instead of a database webhook. If Inngest is unreachable the message is still saved and extraction is skipped.
- **Team matching runs in the request.** The instructor waits for the result, so `runTeamMatching` calls Gemini directly; Gemini only proposes, and teams are created when the instructor approves.
- **Notifications are database triggers** (`0002_notifications.sql`), so every write path produces them and clients never need insert rights.
- **AI model:** `gemini-3.8-flash` by default, set `GEMINI_MODEL` to change it. Every answer is checked against its zod schema before use.

## Roadmap

1. ✅ Schema, access rules and storage
2. ✅ Auth on Supabase
3. ✅ Teams, tasks, chat (Realtime), files (Storage), notifications, peer review
4. ✅ Analytics and conflicts on the SQL views
5. ✅ AI jobs: task extraction, team health, team matching
6. ✅ `/student/*` and `/instructor/*` routes (next: move first-load data into Server Components)
7. Course management UI (courses and enrollments are seeded or added in SQL today)
