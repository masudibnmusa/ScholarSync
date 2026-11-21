![ScholarSync: every teammate, on the same page. Students plan, chat and share files. Instructors see every team's health, conflicts and progress at a glance.](docs/banner/light-1280x400.png)

# ScholarSync

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white&labelColor=2e2620)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white&labelColor=2e2620)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=2e2620)](https://www.typescriptlang.org)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white&labelColor=2e2620)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_·_Auth_·_Realtime-3ECF8E?style=flat-square&logo=supabase&logoColor=white&labelColor=2e2620)](https://supabase.com)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=white&labelColor=2e2620)](https://orm.drizzle.team)
[![Gemini](https://img.shields.io/badge/AI-Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white&labelColor=2e2620)](https://ai.google.dev)
[![Inngest](https://img.shields.io/badge/Jobs-Inngest-F97316?style=flat-square&labelColor=2e2620)](https://www.inngest.com)
[![Vercel](https://img.shields.io/badge/Hosting-Vercel-000000?style=flat-square&logo=vercel&logoColor=white&labelColor=2e2620)](https://vercel.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-F59E0B?style=flat-square&labelColor=2e2620)](LICENSE)

A collaboration hub for university group projects. Students work in teams with chat, a shared task list (each task shows whether it is to do, in progress or done), shared files and peer reviews. Instructors oversee every team in their courses through analytics, conflict alerts and AI-assisted team matching.

> **Status:** the Supabase backend is implemented: auth, teams, tasks, chat (Realtime), files (Storage), notifications, peer review, conflict alerts, and the AI jobs. See [Implementation notes](#implementation-notes) for where the code differs from the diagram.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, Radix primitives, Phosphor icons, Framer Motion, cmdk |
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
| `messages` | read, post as self | read, post as self | none |
| `files` + storage | read, upload, delete own | read, upload (chat attachments), delete own | none |
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
ScholarSync/
├── src/
│   ├── app/                              Next.js App Router
│   │   ├── layout.tsx                    Root layout: Plus Jakarta Sans font, providers, metadata
│   │   ├── page.tsx                      Landing page (static)
│   │   ├── actions.ts                    Server Actions: every read and write, zod-validated, run as the user (RLS)
│   │   ├── globals.css                   Design tokens (light + dark): navy brand, amber accent, chart palette
│   │   ├── error.tsx · not-found.tsx     Error and 404 pages
│   │   ├── icon.tsx                      Generated favicon
│   │   ├── api/inngest/route.ts          Inngest endpoint that serves the AI jobs
│   │   ├── (auth)/                       Signed-out pages; signed-in users are redirected home
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   └── (app)/                        Signed-in app: layout.tsx checks the session
│   │       ├── loading.tsx               Shared loading skeleton
│   │       ├── student/                  layout.tsx allows students only
│   │       │   ├── page.tsx              Workspace: board + floating chat & files popup
│   │       │   ├── peer-review/          Review teammates
│   │       │   ├── notifications/
│   │       │   ├── profile/
│   │       │   └── chat/ · tasks/ · files/   Old URLs, redirect into the workspace
│   │       └── instructor/               layout.tsx allows instructors only
│   │           ├── page.tsx              Workspace: team list, read-only board, alerts dropdown in the team header, floating chat & files popup
│   │           ├── analytics/            Progress, contribution and health per team
│   │           ├── conflicts/            AI conflict alerts to resolve
│   │           ├── matching/             AI team matching: run, review, approve
│   │           ├── notifications/
│   │           ├── profile/
│   │           └── teams/                Old URL, redirects into the workspace
│   ├── components/
│   │   ├── providers.tsx                 Theme, motion, tooltip and toast providers
│   │   ├── app/                          App shell
│   │   │   ├── app-shell.tsx             Layout: icon rail (desktop), top bar + tab bar (phones)
│   │   │   ├── sidebar.tsx · topbar.tsx
│   │   │   ├── nav.ts                    Student and instructor navigation
│   │   │   ├── command-menu.tsx          Ctrl/Cmd+K
│   │   │   ├── notifications.tsx · profile.tsx
│   │   │   ├── page.tsx                  Page, PageHeader, StatCard, EmptyState, Logo
│   │   │   └── user-context.tsx          Signed-in user for client components
│   │   ├── student/                      workspace, kanban, chat, files, peer-review, shared (team hooks, AI button)
│   │   ├── instructor/                   workspace, analytics, charts, conflicts, matching
│   │   ├── landing/                      Landing page and its interactive product demo
│   │   ├── auth/                         Sign-in / sign-up form and frame
│   │   └── ui/                           Primitives: button, card, badge, dialog, alert-dialog, dropdown-menu,
│   │                                     select, segmented, input, progress, avatar, skeleton, overlays, motion
│   ├── db/
│   │   ├── schema.ts                     Drizzle schema (mirrors the SQL migrations)
│   │   └── index.ts                      withUser(): runs queries as the signed-in user; adminDb for jobs only
│   ├── inngest/
│   │   ├── client.ts                     Inngest client
│   │   └── functions.ts                  Jobs: task extraction (debounced), nightly team health
│   ├── lib/
│   │   ├── ai.ts                         Gemini calls (JSON schema output, chat treated as untrusted data)
│   │   ├── store.ts                      Zustand store: calls Server Actions, subscribes to Realtime
│   │   ├── session.ts                    Signed-in profile for server layouts (cached per request)
│   │   ├── supabase/                     client.ts (browser) · server.ts (server)
│   │   ├── types.ts                      Shared types: tasks, chat, teams, notifications, files
│   │   └── utils.ts                      cn(), initials and name helpers
│   ├── hooks/use-client.ts               useMounted, useStoredValue (localStorage), useClientValue
│   └── proxy.ts                          Refreshes the Supabase session cookie on each request
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql                 Schema, RLS, views, indexes, storage
│   │   ├── 0002_notifications.sql        Notification triggers
│   │   └── 0003_instructor_chat.sql      Instructors post and attach files in team chat; reply notifications
│   ├── seed.sql                          Local demo data
│   ├── ai-test-data.sql                  Data for testing the AI features
│   └── config.toml                       Local Supabase config
├── tests/e2e/                            Black-box Playwright tests: auth, student, profile, instructor
│   ├── helpers.ts · global-teardown.ts   Sign-in helpers; deletes the e2e accounts after a run
│   └── fixtures/photo.png                Image for the profile photo tests
├── docs/
│   ├── system-architecture.svg
│   ├── database-architecture.svg
│   └── banner/                           README banner: banner.html source + exported PNGs
├── public/                               favicon.svg, robots.txt
├── .env.example                          Environment variables to copy into .env.local
└── package.json · next.config.ts · playwright.config.ts · tsconfig.json · eslint.config.mjs · components.json
```

## Getting started

Requires Node 20+ and Docker. The Supabase CLI is a dev dependency.

```bash
npm install
npx supabase start                 # local Postgres, Auth, Realtime, Storage
npx supabase db reset              # applies migrations + seed.sql
cp .env.example .env.local         # fill in the values printed by `supabase start`
npm run dev                        # http://localhost:3000
npm run dev:inngest               # optional: runs the AI jobs locally (needs GEMINI_API_KEY)
```

**After the first setup**, start working with Docker running:

```bash
npx supabase start
npm run dev
```

Stop with `Ctrl+C` for the dev server and `npx supabase stop` for Supabase. Local data is kept between runs.

`.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key), `DATABASE_URL` (the DB URL; use the transaction pooler in production) and `GEMINI_API_KEY` (from Google AI Studio). `DATABASE_URL` and `GEMINI_API_KEY` are server-only. Optional: `GEMINI_MODEL` (overrides the default model) and `INNGEST_DEV=1` (use the local Inngest dev server). In production also set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.

**Demo accounts** (seed, password `password123`): instructor `selim.reja@university.edu`; students `masud@`, `nazmul@`, `chinmoy@` (Team Nova) and `sara@`, `rahim@`, `fatima@` (Team Orbit), all `@university.edu`.

### End-to-end tests

Black-box tests in [`tests/e2e/`](tests/e2e) drive the running app in a real browser with [Playwright](https://playwright.dev): they sign in, click and type like a user, and import nothing from `src/`. They cover sign-in and role guards, creating and deleting a task, My week's live clock and month view, the auto-hiding sidebar, the command menu, the profile photo crop/replace/remove flow and the instructor pages.

```bash
npx playwright install chromium    # once
npm run test:e2e                   # starts `npm run dev` if it isn't running
npx playwright show-report         # after a run: steps, screenshots and traces
```

They need local Supabase with the seed. Tests that change data use a fresh account per run or clean up after themselves; accounts named `e2e-…@university.edu` are deleted when the run ends.

**Test data**

| Data | Used for |
|---|---|
| Seed student `masud@university.edu` (Team Nova, team id `00000000-0000-4000-a000-000000000001`) | Workspace, task, My week, sidebar and command menu tests. The task test deletes the task it creates. |
| Seed instructor `selim.reja@university.edu` (teaches `CSE-3200`) | Instructor pages and role guards (read only) |
| A new `e2e-<time>-<random>@university.edu` account per test | Sign-up and profile photo tests, so no real photo is replaced or removed |
| [`tests/e2e/fixtures/photo.png`](tests/e2e/fixtures/photo.png) (600 × 360, four coloured quarters) | A wide photo to crop into a square |
| A generated `notes.txt` (`text/plain`) | Checks that non-images are refused |
| A throwaway course `E2E-<time>` with two new students | The course management test; it deletes the course itself, and the teardown removes any `E2E-` course left by a failed run |
| Wrong password `not-the-password` | The sign-in error message |

All seed accounts use the password `password123`.

**Latest run:** 22 of 22 passed in 43 s (2026-11-22, Chromium, 1440 × 900, local Supabase with the seed).

| Area | Test | Result |
|---|---|---|
| Sign-in and access | A signed-out visitor is sent to the sign-in page | ✅ Pass |
| | A wrong password shows an error and stays signed out | ✅ Pass |
| | Empty fields are flagged before anything is sent | ✅ Pass |
| | A student lands on their dashboard and can sign out | ✅ Pass |
| | A student can't open instructor pages | ✅ Pass |
| | An instructor lands on their dashboard and can't open student pages | ✅ Pass |
| | A signed-in user visiting `/login` goes straight home | ✅ Pass |
| | A new account is created as a student and signed in | ✅ Pass |
| Student workspace | Creates a task on the team board, then deletes it | ✅ Pass |
| | A task needs a title | ✅ Pass |
| | My week shows a live clock and today on the calendar | ✅ Pass |
| | My week switches between list and month views | ✅ Pass |
| | The sidebar opens on hover and closes when the pointer leaves | ✅ Pass |
| | Ctrl+K opens the command menu | ✅ Pass |
| Profile photo | Crop, save, replace and remove a photo (saved at 512 × 512; cancel keeps the old one) | ✅ Pass |
| | A file that isn't an image is refused | ✅ Pass |
| Course management | Create a course, add students by email (added / no account / not a student / typo caught), create a team by hand, turn joining off and reset the code, archive (read-only for instructor and team), restore, remove a student, delete | ✅ Pass |
| Instructor | Analytics page opens | ✅ Pass |
| | Conflicts page opens | ✅ Pass |
| | AI team matching page opens | ✅ Pass |
| | Notifications page opens | ✅ Pass |
| | The course dashboard lists the seeded course | ✅ Pass |

Not covered yet: sending chat messages (it would notify the seeded teammates and start AI task extraction), the AI features themselves, and phone-sized screens.

### Testing the AI features

[`supabase/ai-test-data.sql`](supabase/ai-test-data.sql) loads chat and students built to exercise each AI feature, and lists the expected results at the top. It is safe to re-run: it clears earlier AI results and teams made by matching first.

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/ai-test-data.sql
npm run dev                        # terminal 1
npm run dev:inngest               # terminal 2, then open http://localhost:8288
```

| Feature | How to run it | Where to check |
|---|---|---|
| Task extraction | In the Inngest UI, send event `chat/message.created` with `{"teamId": "00000000-0000-4000-a000-000000000001"}` (or send any chat message as `masud@`). Runs after 2 minutes of quiet. | `masud@` → workspace: 4 suggested tasks |
| Team health and conflicts | In the Inngest UI, open the `assess-team-health` function and click **Invoke** | `selim.reja@` → Conflicts: an alert for Team Orbit; Analytics: Orbit's health drops |
| Team matching | `selim.reja@` → Matching → run it | Proposals that place the 20 new students in teams of about 3 (some of 4, none under 2) |

## Implementation notes

Where the code differs from the diagram, and why:

- **Routes with a client store.** Each screen is a real route (`/student/chat`, `/instructor/teams?team=<id>`, …), guarded by server layouts that check the session and the role. The screens themselves are Client Components: data is loaded by Server Actions called from the Zustand store, which also holds the Realtime subscriptions. The access path is the same: Next.js server → Drizzle → Postgres as the user.
- **Peer reviews are write-only for students.** There is no "my reviews" query, so the UI remembers which teammates you reviewed in `localStorage`; the database's unique constraint still rejects a second review.
- **Events come from the Server Action.** `sendMessage` sends the Inngest event after the insert, instead of a database webhook. If Inngest is unreachable the message is still saved and extraction is skipped.
- **Team matching runs in the request.** The instructor waits for the result, so `runTeamMatching` calls Gemini directly; Gemini only proposes (never a team under 2 students), and teams are created when the instructor approves.
- **Instructors can join team chat.** They post and attach files as themselves (marked "Instructor"), and every team member is notified. Once an instructor has posted in a team's chat, student replies notify them too, with at most one unread reply notification per team so a busy chat doesn't flood them. The Files tab stays read-only for instructors; files they attach in chat appear there. Chat and Files share one popup, opened from a floating button in the bottom-right corner of each workspace (full screen on phones) that shows an unread count; `?view=chat` and `?view=files` open it. Instructors see a team's conflict alerts in a dropdown next to its health badge. Anyone can attach a file by dropping it on the thread.
- **Archived courses are read-only in the database.** One trigger on the tables of team work and membership (`0021_course_management.sql`) rejects changes from signed-in users once a course is archived; grading, announcements and the course itself stay editable, and admin work and background jobs pass. Self-join checks `joining_open`, and instructors add students by email through `enroll_students()`, which only reports per address whether it worked.
- **Notifications are database triggers** (`0002_notifications.sql`), so every write path produces them and clients never need insert rights.
- **AI model:** `gemini-3.5-flash-lite` by default, with low thinking; set `GEMINI_MODEL` to change it. It answers in 1-2 seconds; when tested on 2026-11-16, `gemini-3.7-flash` and `gemini-3.8-flash` took 2-4 minutes per call because of queuing at Google. Every answer is checked against its zod schema before use.

## Roadmap

1. ✅ Schema, access rules and storage
2. ✅ Auth on Supabase
3. ✅ Teams, tasks, chat (Realtime), files (Storage), notifications, peer review
4. ✅ Analytics and conflicts on the SQL views
5. ✅ AI jobs: task extraction, team health, team matching
6. ✅ `/student/*` and `/instructor/*` routes (next: move first-load data into Server Components)
7. ✅ Course management: create and edit courses, invite link with joining on/off and code reset, add students by email, remove students, create teams by hand, archive (read-only) and restore

## License

[MIT](LICENSE) 
