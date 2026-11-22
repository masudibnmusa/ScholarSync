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

1. The browser opens a page such as `/student/tasks`. The app layout loads what every page shares (teams, notifications, photos, and for instructors the alerts and at-risk count) on the server, and the course dashboard loads its courses there too, so the page arrives with them: `AppStoreSnapshot` in `src/lib/store.ts` hands that data to `useAppStore` as a per-request snapshot while server rendering and hydrating, and the browser store starts from the same objects. In dev, the workspace now shows its team in about 0.2 s instead of 0.9 s. My week and the task board still load in the browser: they group by the viewer's own clock and time zone. After that, and for every change, the store calls a Server Action. The action queries Postgres **as the signed-in user** through `withUser()` in [`src/db/index.ts`](src/db/index.ts): Drizzle connects as a role that bypasses RLS, so each query runs in a transaction that first sets `role = authenticated` and `request.jwt.claims` from the verified session. Never query with `adminDb` from a user request.
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
│   │   ├── locale.tsx · language-switch.tsx  useT() (the page's language) and the English / বাংলা switch
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
│   │   ├── i18n/                         index.ts (t, tn, msg) · bn.ts (Bangla) · notices.ts (notification text)
│   │   ├── locale-server.ts              The request's language; translated page titles
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
│   ├── helpers.ts · global-setup.ts · global-teardown.ts   Sign-in helpers; checks the seeded accounts are in English; deletes the e2e accounts after a run
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

Phone and desktop alerts need a VAPID key pair: run `npx web-push generate-vapid-keys` once and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (server-only) and `VAPID_SUBJECT` (a `mailto:` address push services can contact). Without them the app works and the Alerts switch says alerts aren't set up. Alerts are sent by an Inngest job, so `npm run dev:inngest` must be running locally.

**Demo accounts** (seed, password `password123`): instructor `selim.reja@university.edu`; students `masud@`, `nazmul@`, `chinmoy@` (Team Nova) and `sara@`, `rahim@`, `fatima@` (Team Orbit), all `@university.edu`.

### End-to-end tests

Black-box tests in [`tests/e2e/`](tests/e2e) drive the running app in a real browser with [Playwright](https://playwright.dev): they sign in, click and type like a user, and import nothing from `src/`. They cover sign-in and role guards, the student workspace and My week, the profile photo, installing and alerts, course management, hand-ins, team chat, live updates, the stand-up, grading and the gradebook export, offline mode, the at-risk page, contribution reports, GitHub, the team charter, office hours, tasks from meeting notes and the Bangla interface. Every row in the results table below names what it checks.

```bash
npx playwright install chromium    # once
npm run test:e2e                   # starts `npm run dev` if it isn't running
npx playwright show-report         # after a run: steps, screenshots and traces
```

Unit checks for the pure modules (`src/lib/*.check.mjs`; no app or database needed): `npm run test:unit`.

The phone tests (`mobile.spec.ts`) run in a `phone` project: Chromium at 390 × 844 with touch, using the seed accounts read only.

The offline test runs in its own `production` project against `npm run build && npm start -p 3100`, which Playwright starts too (the first run builds, which takes a minute or two).

They need local Supabase with the seed. Tests that change data use a fresh account per run or clean up after themselves; accounts named `e2e-…@university.edu` are deleted when the run ends.

**Test data**

Tests that change data never touch the seed accounts' teams. They make their own accounts and courses, and clean up after themselves.

| Data | Used for |
|---|---|
| Seed student `masud@university.edu` (Team Nova, team id `00000000-0000-4000-a000-000000000001`) | Workspace, task, My week, sidebar and command menu tests. The task test deletes the task it creates. |
| Seed instructor `selim.reja@university.edu` (teaches `CSE-3200`) | Instructor pages and role guards (read only). Also the instructor of every throwaway course below, so it gets those courses' notifications (bookings, hand-ins). |
| A new `e2e-<time>-<random>@university.edu` account per student in a test | Sign-up, profile photo, alerts and every team test, so no real photo, device or team is touched. Names start with `E2E` (e.g. *E2E Ada*). The teardown deletes all `e2e-` accounts. |
| A throwaway course `E2E-<base36 time>` with one team, *E2E Team*, of new students (`courseWithTeam()` in [`helpers.ts`](tests/e2e/helpers.ts)) | Course management, submissions, chat, live updates, stand-up, at risk, grading, offline, contribution, GitHub, charter, office hours, meeting notes and trends. Each test deletes its course; the teardown removes any `E2E-` course a failed run left. |
| Rows added with the local service role (`adminRest()` in [`helpers.ts`](tests/e2e/helpers.ts)), only for throwaway teams | History a browser can't create in a test run: a falling-behind case (flagged 4 days ago, escalated 1 day ago); a done task, 4 messages and a 4/5 peer review (*"E2E: always on time"*) for the contribution report; a linked repo `e2e-org/e2e-project` with 3 commits (2 by `e2e-hal-dev`, 1 by `someone-else`) and a merged PR #7. No test calls GitHub. For trends: two tasks, a past status change, three messages, health scores and a second team, *E2E Second*, all dated relative to this week's Monday. |
| Rubric *Code* (/40) and *Report* (/60), marks 30 and 54, factor override 0.9 | Grading: team grade 84%, final grades 84 and 75.6 in the exported CSV |
| GitHub usernames `bad_name!` (refused) and `@e2e-hal-dev` (saved) | Profile validation and matching commits to a student (GitHub's `E2E-Hal-Dev` matches regardless of case) |
| Repo input `not a repo` | Refused before anything is sent to GitHub |
| Office hours: three 20-minute slots from 15:00 tomorrow in *Room 402*, topic *"E2E: our database design"* | Booking, the .ics file, cancelling and removing a slot |
| Meeting notes naming *E2E Ada* (due 2026-12-04), *E2E Ben* (due 2026-12-08), an unowned test plan and a decision | The Gemini test (`E2E_AI=1` only): 3 items, the decision skipped |
| [`tests/e2e/fixtures/photo.png`](tests/e2e/fixtures/photo.png) (600 × 360, four coloured quarters) | A wide photo to crop into a square |
| A generated `notes.txt` (`text/plain`) | Checks that non-images are refused |
| A 390 × 844 touch screen (the `phone` project) with the seed accounts, read only | Layout on phones. It caught three overflows, now fixed: the AI matching intro, the instructor's course page grid and the team cards' buttons |
| A fake push service (`https://push.e2e.invalid/<uuid>`) | Test browsers have none; the alerts test replaces `PushManager` with it |
| Wrong password `not-the-password` | The sign-in error message |
| A new `e2e-…` account that switches to বাংলা on its profile, then signs in from a second, fresh browser | The language test: the saved language follows the account. A seed account is never switched, since that would change its emails. |
| A signed-out browser with the `lang=bn` cookie, cleared at the end | Picking বাংলা on the sign-in page |

All seed accounts use the password `password123`.

**Latest run:** 47 of 47 passed in 3 min, with the AI test skipped as usual (2026-11-22, Chromium; desktop 1440 × 900, phone 390 × 844, and the offline test against a production build; local Supabase with the seed). Unit checks: 14 of 14 passed. The run stops first if a seeded account is set to a language other than English (someone used it in বাংলা), since the tests read it in English.

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
| Assignment submissions | Add a hand-in milestone due yesterday; empty and invalid-link hand-ins refused; hand in a file + link + note (marked late); instructor reviews and leaves feedback; student sees it, hands in a new version (feedback marked as on an earlier version); both notified | ✅ Pass |
| Install and alerts | The manifest is served with its icons and the service worker controls the whole site | ✅ Pass |
| | Turn alerts on (saved on the server, still on after a reload) and off again; the browser's push service is faked, since test browsers have none | ✅ Pass |
| Live updates | Two students and the instructor in separate browsers: a team rename, a new profile photo and a new announcement appear on the others' open pages without a reload | ✅ Pass |
| Weekly stand-up | The Monday link opens the stand-up; Send stays off until something is written; a teammate sees the answers arrive live; editing turns Send into Update; the instructor finds the team, reads the answers and who is still missing, and can ask for the AI summary | ✅ Pass |
| Grading | Set a two-criterion rubric, grade the team with a factor override for one student, export the gradebook: one row per student with each criterion's points, team grade, factor and final grade | ✅ Pass |
| Phone (390 × 844) | Every student page and every instructor page, including the course page, fits the screen: no sideways scroll and nothing sticking out past the edge | ✅ Pass |
| | The tab bar shows Dashboard, Workspace, Week and Reviews; Week becomes the current tab; More opens a sheet with Notifications and Profile, which navigates and closes | ✅ Pass |
| | The workspace's Charter, Stand-up, Repo and New buttons stay on screen; chat opens full screen | ✅ Pass |
| Offline (production build) | Open the workspace, chat and My week once; offline they open from the last copy with a banner; a message written offline shows "Waiting to send"; a page never opened says so; back online the message is sent and a teammate sees it live; signing out leaves no saved pages or data | ✅ Pass |
| Contribution report | With a done task, messages and a peer review added for a throwaway team: the instructor opens a student's report from the roster (task share, chat share, team comparison, this week's activity, the task marked done, peer score and feedback); the student opens their own from the course page, without peer reviews | ✅ Pass |
| GitHub per team | A malformed username is caught on the profile, then saved; something that isn't a repo is refused without calling GitHub; with a repo and activity added as the sync job would, the open dialog shows commits per member (usernames matched regardless of case), commits by strangers under their GitHub name and a merged PR; the student's contribution report counts the commits; a teammate unlinks the repo and its activity is removed | ✅ Pass |
| Team charter | A student writes roles and meeting times (Save stays off while empty); the teammate is notified, opens it from the notification and agrees, seen live; the teammate edits it and the writer is asked to agree again (dot on the button); the instructor finds the team and reads it with who agreed, without edit or agree buttons | ✅ Pass |
| Office hours | The instructor adds three 20-minute slots for tomorrow (times previewed); a student books one with a topic; the team then has no Book buttons (one booking per team), and a teammate and the instructor see the booking live; the .ics download has the right title, room, topic and UTC times; My week shows it as "Tomorrow, 3:20 PM" with the room, and its calendar export includes it as a timed event; the instructor cancels it (the team is notified and can book again) and removes a slot | ✅ Pass |
| Trends | With 10 weeks of history added for a throwaway course (two tasks, one finished two weeks ago, three messages last week, health 70 then 55) and a second, empty team: the instructor picks the course, both teams are in the legend, and the table view shows completion 0% → 50%, one task done, three messages and health 70 → 55 in the right weeks, with no data for the empty team; the arrow keys read a week aloud | ✅ Pass |
| At risk | A falling-behind case added for a throwaway student raises the At risk nav badge by one, live, and shows on the instructor's At risk page with its signals, team and stage; when it resolves it moves to Recovered without a reload and the badge drops back; students can't open the page | ✅ Pass |
| Team chat | Two students: a question and a reply quoting it (live), a 👍 reaction seen live, add and take back your own reaction, search finds messages and a shared file, a hit jumps to the message, no-match message | ✅ Pass |
| Language | A new student switches to বাংলা in Profile: the page reloads with `lang="bn"`, Bangla navigation, headings and tab title, on every page, with no hydration errors; signing in from a fresh browser switches it to Bangla too (saved on the account); switching back gives English | ✅ Pass |
| Language follows the account | A second browser with an old `lang=en` cookie, signed in to the same account, switches to Bangla after the account does instead of saving English back; a language picked on the sign-up page is saved to the new account and a fresh browser gets it | ✅ Pass |
| First load | The seeded student's and instructor's dashboards and workspaces arrive from the server with their courses and teams (no loading skeleton in the HTML), and 16 pages open without hydration errors with the browser at UTC+14, far from the server's time zone | ✅ Pass |
| Deadline extensions | A new student asks for more time on a milestone: a date that isn't later is refused, then the request waits; the instructor sees it live with the reason and approves it; the student's milestone moves to the new date live, and the team is notified | ✅ Pass |
| Contribution report as PDF | On the instructor's view of a student's report, *Save as PDF* opens the print dialog; in print, the navigation and the button are gone and the line naming the student and date shows | ✅ Pass |
| | A visitor picks বাংলা on the sign-in page: the form and the landing page are in Bangla | ✅ Pass |
| Instructor | Analytics page opens | ✅ Pass |
| | Conflicts page opens | ✅ Pass |
| | AI team matching page opens | ✅ Pass |
| | Notifications page opens | ✅ Pass |
| | The course dashboard lists the seeded course | ✅ Pass |

**Database check.** The falling-behind rules run on days of history, which a browser test can't wait for, so they have their own SQL test with made-up people, run in one transaction that is rolled back. It covers the private nudge, no repeat the same day, instructor alert after 3 days (once), recovery, slipping back within a week, a new episode later, low peer scores, and archived courses. Latest run: 8 of 8 passed (2026-11-22). Deadline extensions have one too (`supabase/tests/deadline_extensions.sql`): outsiders can't ask, the date must be later, the team can't approve its own request or set its date, the instructor can't change the request and decides only once, asking again keeps the approved date, declining keeps it too, risk alerts use the team's date, and a done milestone takes no requests. Latest run: 9 of 9 passed (2026-11-22).

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/falling_behind.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/deadline_extensions.sql
```

Not covered yet: sending chat messages as the seed accounts (the chat tests use throwaway teams, so seeded teammates aren't notified), and most AI features (only meeting notes has a test, run with `E2E_AI=1`).

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
| Weekly stand-up | As `masud@` and `nazmul@`, open Stand-up in Team Nova and answer (say one of you is blocked). Then as `selim.reja@` open Team Nova → Stand-up → **Summarise now**, or wait 10 minutes for the job | `selim.reja@` → the summary names who did what and lists the blocker; a "stand-up: 1 blocked" notification |
| Tasks from meeting notes | `E2E_AI=1 npx playwright test tests/e2e/meeting-notes.spec.ts` (throwaway team; skipped in normal runs) | Notes naming two students with dates and one unowned job become 3 items with the right owners and dates, and the decision is skipped; the student unticks one and adds 2 tasks, and a teammate sees them live. Passed on 2026-11-22 |

## Implementation notes

Where the code differs from the diagram, and why:

- **Routes with a client store.** Each screen is a real route (`/student/chat`, `/instructor/teams?team=<id>`, …), guarded by server layouts that check the session and the role. The screens themselves are Client Components: data is loaded by Server Actions called from the Zustand store, which also holds the Realtime subscriptions. The access path is the same: Next.js server → Drizzle → Postgres as the user.
- **Peer reviews are write-only for students.** There is no "my reviews" query, so the UI remembers which teammates you reviewed in `localStorage`; the database's unique constraint still rejects a second review.
- **Events come from the Server Action.** `sendMessage` sends the Inngest event after the insert, instead of a database webhook. If Inngest is unreachable the message is still saved and extraction is skipped.
- **Team matching runs in the request.** The instructor waits for the result, so `runTeamMatching` calls Gemini directly; Gemini only proposes (never a team under 2 students), and teams are created when the instructor approves.
- **Instructors can join team chat.** They post and attach files as themselves (marked "Instructor"), and every team member is notified. Once an instructor has posted in a team's chat, student replies notify them too, with at most one unread reply notification per team so a busy chat doesn't flood them. The Files tab stays read-only for instructors; files they attach in chat appear there. Chat and Files share one popup, opened from a floating button in the bottom-right corner of each workspace (full screen on phones) that shows an unread count; `?view=chat` and `?view=files` open it. Instructors see a team's conflict alerts in a dropdown next to its health badge. Anyone can attach a file by dropping it on the thread.
- **Archived courses are read-only in the database.** One trigger on the tables of team work and membership (`0021_course_management.sql`) rejects changes from signed-in users once a course is archived; grading, announcements and the course itself stay editable, and admin work and background jobs pass. Self-join checks `joining_open`, and instructors add students by email through `enroll_students()`, which only reports per address whether it worked.
- **Assignment submissions hang off milestones** (`0022_submissions.sql`). A milestone marked "Teams hand in work" takes one submission per team (a file in the `team-files` bucket under `<team>/submissions/`, a link, or both, plus a note); handing in again replaces it and marks the milestone done. A trigger lets the team change only the hand-in and the instructor only the feedback. Late means after the end of the due day in the viewer's time zone. Marks still go in the rubric grading.
- **Chat replies and reactions** (`0023_chat_replies_reactions.sql`): `messages.reply_to` quotes the answered message (RLS keeps it in the same team), and `message_reactions` holds one row per person per emoji from a fixed set of six, live over Realtime. Search matches message text and file names in the open team (case-insensitive, newest first).
- **Install and alerts** (`0024_push.sql`): `src/app/manifest.ts` and `public/sw.js` make the app installable; the service worker shows alerts and opens the page they point to. Each browser that turns alerts on stores one `push_subscriptions` row. An Inngest job runs every minute, claims new notifications (`pushed_at`) so none is sent twice, and pushes all except routine chat messages (@mentions still go) that are under an hour old. Subscriptions a push service reports gone (404/410) are deleted. On iPhone and iPad, alerts work only from the Home Screen app (iOS 16.4+).
- **Live updates everywhere** (`0025_live_updates.sql`): besides the filtered chat, board and notification feeds, one Realtime channel per signed-in user listens to the other tables (profile photos, courses, rosters, teams, files, task comments and checklists, milestones and hand-ins, announcements, reviews, recaps, grading). Realtime checks RLS per row, so people only hear about what they can read; a delete carries only the row id. Changes are batched for 250 ms, then the store refreshes avatars, teams and files, and pages that load their own data reload through `useLive(...tables)`. The channel loads the session token before joining; without it the channel joined as anonymous and RLS dropped every row.
- **Weekly stand-up** (`0026_standups.sql`): at 06:05 UTC each Monday, right after the recaps, every student in an active course is asked what they finished, what is next and what blocks them. The team and the instructor see the answers. Each answer queues an Inngest event; once a team's answers have been quiet for 10 minutes (at most an hour), Gemini writes a summary with a list of blockers, reading last week's recap as background. Only the instructor can read it (`standup_summaries` RLS). The instructor is notified the first time and again when more blockers appear, and can also ask for the summary from the dialog.
- **Who's falling behind** (`0027_falling_behind.sql`): every morning at 07:20 UTC, `check_falling_behind()` checks each student in each team of an active course for three signals: 2+ overdue tasks (or one 3+ days late), 7+ days silent in team chat while teammates talk, and peer reviews averaging 2.5/5 or lower (from 2+ reviews). Two signals together start an episode: the student gets a private "quick check-in" naming them. If two signals still hold 3 days later, the instructor is told once. Slipping back within 7 days of recovering continues the episode without another nudge. This complements `send_risk_alerts()` (0017), which flags whole teams. The instructor's **At risk** page (`/instructor/at-risk`) lists open cases (escalated ones first) and those that recovered in the last 30 days, live (`0028_at_risk.sql`). Its nav item shows the number of open cases, which also adds to the phone's *More* tab.
- **Office hours** (`0031_office_hours.sql`): on the course page the instructor adds back-to-back slots (date, start, length, how many, where). The browser turns them into instants in the instructor's time zone, which is stored to write times in messages. Enrolled students see them. A team member books a free slot with a topic through `book_office_hour()`, which locks the row and allows one upcoming booking per team per course; other teams' bookings show only as *Booked*. Cancelling (`cancel_office_hour()`, by the team or the instructor) and removing a booked slot notify the other side. `/api/office-hours/<id>` downloads the slot as an .ics file. Booked slots also appear in My week, at their time, and in its calendar export as timed events, with the same UID so a calendar keeps one copy. An Inngest job runs every 5 minutes and, about an hour before each booked slot, claims it (`reminded_at`, so it is sent once) and notifies the team and the instructor; the push job sends that to phones. It also emails them with a calendar link, unless they turned emails off. Checked on 2026-11-22 with a slot 30 minutes away: both were notified once, with the time in the slot's zone, and the email reached Mailpit.
- **Tasks from meeting notes**: *From notes* on the board takes pasted notes. Gemini lists the action items (title, owner, due date; relative dates like "Friday" are worked out from today). The notes go in `<notes>` tags as data, never instructions. The answer is cleaned in `src/lib/action-items.ts`, which has unit tests: an owner only when the name is a team member (full name, or a first name only one member has), a due date only when it is a real date within a year, and duplicates dropped. The student ticks, edits and assigns each item, then *Add N tasks* inserts them in one statement (`createTasks`). Nothing is saved before that.
- **Team charter** (`0030_team_charters.sql`): each team writes down roles, meeting times, what happens when work is missed and how they communicate. Any member can write or edit it (the *Charter* button in the workspace, or `?charter=1`). Each member agrees to it. A trigger records the writer as agreeing, clears everyone else's agreement when the text changes, and notifies them. The button shows a dot until you have agreed. The instructor reads it with who has agreed, and each conflict alert links to it.
- **GitHub per team** (`0029_github.sql`, `src/lib/github.ts`): a team member or the instructor links the team's repo in the workspace's *Repo* dialog (owner/name, a GitHub link or an SSH remote; GitHub is asked whether it exists). Students add their GitHub username in their profile. An Inngest job reads each linked repo every 30 minutes, and right after linking, through the GitHub REST API: commits since the last check (with a day of overlap; 120 days the first time; merge commits skipped) and the 50 most recently updated pull requests. These go into `repo_activity`, which team viewers can read. It polls instead of using webhooks, so it needs no public URL or GitHub App. Activity is matched to members by username when read, so adding a username later counts earlier commits too. Commits show in the dialog and in the contribution report (a *Commits* card and a share in the team comparison). Without `GITHUB_TOKEN` only public repos work, at 60 requests an hour for the whole server (each sync uses 2-4). Checked against the public `octocat/Hello-World` on 2026-11-22: a wrong name was refused, a pasted `.git` link was accepted, and 50 pull requests came in with no error.
- **Contribution report** (`/instructor/courses/<id>/students/<user>`, and `/student/courses/<id>/contribution` for yourself): one student's tasks done and assigned, messages, files and stand-ups, each as a share of the team's, a comparison with each teammate, the last 8 weeks of activity and their assigned tasks (done late or overdue flagged). The instructor also sees peer-review scores by category and written feedback without reviewer names, plus any open at-risk signals; RLS already keeps peer reviews from students. It opens from the roster, the At risk page and the student's course page.
- **Offline mode.** The service worker keeps the last copy of each `/student` and `/instructor` page and its scripts, always network-first, so online nothing stale is shown. The store saves what the board, chat (latest 100 messages per team), team list, files, notifications and My week last loaded, per user, in `localStorage` (`src/lib/offline.ts`), and uses it when the server can't be reached. A banner says the app is offline. Chat messages written offline wait in an outbox, shown as "Waiting to send", and go out in order when the connection returns. A Web Lock stops two tabs sending one twice, and a message the server then refuses is shown back to its writer. Files, tasks and other changes still need the connection. Signing out deletes every saved page and copy on the device. Offline only works in a production build: the dev server's hot-reload client won't start without its websocket.
- **Contribution report as PDF**: the report (a student's own, or any student's for the instructor) has a *Save as PDF* button that opens the browser's print dialog, so it saves without a PDF library or server work. Print styles leave out the sidebar, top bar, tab bar, banners and toasts, print on white with the colours kept, keep each card on one page, and add a line under the name: whose report it is, the date it was made, and ScholarSync. Useful for grade appeals and portfolios.
- **Deadline extensions** (`0034_deadline_extensions.sql`): on a course milestone, a team asks for more time with a new date and a reason; the instructor approves or declines it on the course page, and each side is notified. An approved date becomes that team's due date everywhere: the milestone list, late hand-ins, My week and its calendar file, and the missed-milestone alerts. Asking again keeps the approved date until the new request is decided. A trigger decides which columns each side may change, so the team can't approve its own request and the instructor can't rewrite it.
- **Trends** (`0032_health_history.sql`): a card on Analytics with one line per team over the last 10 weeks, for one course at a time. It shows board completion at each week's end (each task's status then, rebuilt from `task_events`), tasks finished, messages, or the AI health score. Health history starts when the migration runs: a trigger keeps the last score of each day in `team_health_history`, since the nightly job overwrites `teams.health_score`. Lines use eight series colours (`--series-1`…`8`), each with its own dark-mode step and validated for colour-blind separation on the card in both themes. Each team keeps its colour when you switch measures. The chart has a legend, labels at the line ends, a tooltip that follows the pointer or the arrow keys, and a table view. It shows up to 8 teams; the rest are left out, and a note says so.
- **Error monitoring** (Sentry, `@sentry/nextjs` 11.11.0; `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/lib/monitoring.ts`): off until `NEXT_PUBLIC_SENTRY_DSN` is set. It reports errors from pages, route handlers, Server Actions and the proxy (`onRequestError`), uncaught browser errors, errors shown on the error page, and background jobs that failed every retry: a job on Inngest's `inngest/function.failed` event reports them, tagged with the job and run. `scrub()` keeps people out of reports: no IP address, cookies, headers, query strings or request bodies, and only the user id (no name or email). Rejected input (zod errors) is dropped. Source maps: when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are set at build time, `next.config.ts` wraps the config in `withSentryConfig`, which uploads the browser and server source maps for the build's release (the git commit) and then deletes the browser maps from `.next/static`, so traces show the real file and line but the code is never served. Its build telemetry is off. Without those variables the build is unchanged. Checked on 2026-11-22 with a stand-in Sentry upload API: the build uploaded the maps and created the release, and no `.map` files were left in `.next/static`. Checked on 2026-11-22 against a stand-in Sentry endpoint: a Server Action error, a browser error and a sync job that failed all retries each arrived once, without any of those fields.
- **Language** (English and বাংলা; `src/lib/i18n/`, `0033_locale.sql`): every screen, dialog, toast, page title, notification, push alert and email. Text is keyed by its English, so code stays readable and anything missing falls back to English; `bn.ts` holds the Bangla. Components translate with `useT()` (the language comes from the root layout, so the server and the browser render the same words); toasts and the store use the global `t()`, which reads `<html lang>`. Plurals use `tn()`. Constant lists of labels mark their text with `msg()` and translate where it is shown. The choice is the `lang` cookie (first visit: the browser's language) plus `users.locale`: the account wins: every browser switches to the account's language, so an old cookie never undoes a change made on another device. A choice made while signed out (sign-in or sign-up page) also sets a `lang_pending` cookie, and the next sign-in saves it to the account. Emails and push alerts use the recipient's `users.locale`. Notifications are written in English by SQL triggers, so `notices.ts` matches each one back to its template when it is read and fills in names, numbers and dates in the reader's language. Dates use `bn-BD` (Bangla digits and month names), and numbers shown on their own go through `num()`, which writes them in Bangla digits (English output is unchanged). CSV exports stay in English, so LMS imports keep their column names. `src/lib/i18n.check.mjs` finds every text the code translates and fails if one has no Bangla or its `{placeholders}` differ. While server rendering, `t()`, `num()` and `intl()` outside components read the request's language from AsyncLocalStorage, so requests in different languages rendering at the same moment never mix (`src/lib/i18n-requests.check.mjs`).
- **Gradebook export.** The grading card's *Export gradebook* button downloads a CSV with one row per enrolled student, keyed by email, for importing into Moodle or Canvas: each rubric criterion's points, the team grade, the saved contribution factor and the final grade (team grade × factor, capped at 100). Blank cells mean not graded. The course page's contribution report is the longer version with tasks, chat and reviews.
- **Notifications are database triggers** (`0002_notifications.sql`), so every write path produces them and clients never need insert rights.
- **AI model:** `gemini-3.5-flash-lite` by default, with low thinking; set `GEMINI_MODEL` to change it. It answers in 1-2 seconds; when tested on 2026-11-16, `gemini-3.7-flash` and `gemini-3.8-flash` took 2-4 minutes per call because of queuing at Google. Every answer is checked against its zod schema before use.

## Roadmap

1. ✅ Schema, access rules and storage
2. ✅ Auth on Supabase
3. ✅ Teams, tasks, chat (Realtime), files (Storage), notifications, peer review
4. ✅ Analytics and conflicts on the SQL views
5. ✅ AI jobs: task extraction, team health, team matching
6. ✅ `/student/*` and `/instructor/*` routes
7. ✅ Course management: create and edit courses, invite link with joining on/off and code reset, add students by email, remove students, create teams by hand, archive (read-only) and restore
8. ✅ Install on phone with push alerts
9. ✅ Live updates for every page
10. ✅ AI weekly stand-up
11. ✅ Early warning for students falling behind, with an At risk page
12. ✅ Gradebook export for LMS import
13. ✅ Offline mode for the installed app
14. ✅ Contribution report per student
15. ✅ GitHub repo per team
16. ✅ Team charter
17. ✅ Tasks from meeting notes
18. ✅ Office hours booking
19. ✅ Office hours in My week
20. ✅ At risk badge in the navigation
21. ✅ Phone-sized tests
22. ✅ Course trends over time
23. ✅ Error monitoring (Sentry)
24. ✅ Bangla interface (বাংলা)
25. ✅ Bangla digits for every number
26. ✅ Per-request language while server rendering
27. ✅ Source maps for Sentry
28. ✅ First data rendered on the server
29. ✅ Deadline extension requests
30. ✅ Contribution report as PDF

## License

[MIT](LICENSE) 
