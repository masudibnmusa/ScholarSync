![ScholarSync: group projects, in sync. Chat, Kanban, shared files and peer review for every team, plus AI that keeps instructors ahead of problems.](docs/banner/board-1280x400.png)

# ScholarSync

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white&labelColor=373063)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white&labelColor=373063)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=373063)](https://www.typescriptlang.org)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white&labelColor=373063)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_·_Auth_·_Realtime-3ECF8E?style=flat-square&logo=supabase&logoColor=white&labelColor=373063)](https://supabase.com)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=white&labelColor=373063)](https://orm.drizzle.team)
[![Gemini](https://img.shields.io/badge/AI-Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white&labelColor=373063)](https://ai.google.dev)
[![Inngest](https://img.shields.io/badge/Jobs-Inngest-F97316?style=flat-square&labelColor=373063)](https://www.inngest.com)
[![Vercel](https://img.shields.io/badge/Hosting-Vercel-000000?style=flat-square&logo=vercel&logoColor=white&labelColor=373063)](https://vercel.com)

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
ScholarSync/
├── src/
│   ├── app/                              Next.js App Router
│   │   ├── layout.tsx                    Root layout: Plus Jakarta Sans font, providers, metadata
│   │   ├── page.tsx                      Landing page (static)
│   │   ├── actions.ts                    Server Actions: every read and write, zod-validated, run as the user (RLS)
│   │   ├── globals.css                   Design tokens (light + dark): indigo brand, orange accent, chart palette
│   │   ├── error.tsx · not-found.tsx     Error and 404 pages
│   │   ├── icon.tsx                      Generated favicon
│   │   ├── api/inngest/route.ts          Inngest endpoint that serves the AI jobs
│   │   ├── (auth)/                       Signed-out pages; signed-in users are redirected home
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   └── (app)/                        Signed-in app: layout.tsx checks the session
│   │       ├── loading.tsx               Shared loading skeleton
│   │       ├── student/                  layout.tsx allows students only
│   │       │   ├── page.tsx              Workspace: board, docked chat, files drawer
│   │       │   ├── peer-review/          Review teammates
│   │       │   ├── notifications/
│   │       │   ├── profile/
│   │       │   └── chat/ · tasks/ · files/   Old URLs, redirect into the workspace
│   │       └── instructor/               layout.tsx allows instructors only
│   │           ├── page.tsx              Workspace: team list, read-only board, chat/files/alerts dock
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
│   │   └── 0002_notifications.sql        Notification triggers
│   ├── seed.sql                          Local demo data
│   ├── ai-test-data.sql                  Data for testing the AI features
│   └── config.toml                       Local Supabase config
├── docs/
│   ├── system-architecture.svg
│   ├── database-architecture.svg
│   └── banner/                           README banner: banner.html source + exported PNGs
├── public/                               favicon.svg, robots.txt
├── .env.example                          Environment variables to copy into .env.local
└── package.json · next.config.ts · tsconfig.json · eslint.config.mjs · components.json
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
- **Notifications are database triggers** (`0002_notifications.sql`), so every write path produces them and clients never need insert rights.
- **AI model:** `gemini-3.5-flash-lite` by default, with low thinking; set `GEMINI_MODEL` to change it. It answers in 1-2 seconds; when tested on 2026-11-16, `gemini-3.7-flash` and `gemini-3.8-flash` took 2-4 minutes per call because of queuing at Google. Every answer is checked against its zod schema before use.

## Roadmap

1. ✅ Schema, access rules and storage
2. ✅ Auth on Supabase
3. ✅ Teams, tasks, chat (Realtime), files (Storage), notifications, peer review
4. ✅ Analytics and conflicts on the SQL views
5. ✅ AI jobs: task extraction, team health, team matching
6. ✅ `/student/*` and `/instructor/*` routes (next: move first-load data into Server Components)
7. Course management UI (courses and enrollments are seeded or added in SQL today)
