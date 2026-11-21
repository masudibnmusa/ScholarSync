import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { inngest } from "./client";
import { adminDb as db } from "@/db";
import { conflictAlerts, messages, notifications, taskSuggestions, tasks, teamMembers, teams } from "@/db/schema";
import { assessTeam, extractTasks } from "@/lib/ai";
import { recentChat, summarizeTeamWeek } from "@/lib/summaries";
import { digestRecipients, sendDigestTo } from "@/lib/digest";
import { sendPendingPushes } from "@/lib/push";
import { standupAskees, summarizeTeamStandup } from "@/lib/standups";

// These jobs write with the database owner role (bypasses RLS): the "service role writes rows" arrow.

export const extractChatTasks = inngest.createFunction(
  {
    id: "extract-chat-tasks",
    triggers: [{ event: "chat/message.created" }],
    // Wait for the conversation to settle, then read it once instead of once per message.
    debounce: { key: "event.data.teamId", period: "2m" },
  },
  async ({ event, step }) => {
    const teamId = String(event.data.teamId);
    const lines = await step.run("load-chat", () => recentChat(teamId));
    if (lines.length === 0) return { created: 0 };

    const existing = await step.run("load-existing", async () => {
      const [t, s] = await Promise.all([
        db.select({ title: tasks.title }).from(tasks).where(eq(tasks.teamId, teamId)),
        db.select({ title: taskSuggestions.title }).from(taskSuggestions).where(eq(taskSuggestions.teamId, teamId)),
      ]);
      return [...t, ...s].map((r) => r.title);
    });

    const found = await step.run("ask-claude", () => extractTasks(lines, existing));

    const ids = new Set(lines.map((l) => l.id));
    const seen = new Set(existing.map((t) => t.toLowerCase()));
    const rows = found
      .filter((t) => t.title.trim() && !seen.has(t.title.toLowerCase()))
      .map((t) => ({
        teamId,
        title: t.title.slice(0, 200),
        description: t.description,
        sourceMessageId: ids.has(t.source_message_id) ? t.source_message_id : null,
      }));

    if (rows.length) await step.run("save", () => db.insert(taskSuggestions).values(rows));
    return { created: rows.length };
  },
);

export const assessTeamHealth = inngest.createFunction(
  { id: "assess-team-health", triggers: [{ cron: "0 2 * * *" }] },
  async ({ step }) => {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const active = await step.run("active-teams", () =>
      db
        .selectDistinct({ id: teams.id, name: teams.name })
        .from(teams)
        .innerJoin(messages, eq(messages.teamId, teams.id))
        .where(gt(messages.createdAt, since.toISOString())),
    );

    for (const team of active) {
      await step.run(`assess-${team.id}`, async () => {
        const result = await assessTeam(team.name, await recentChat(team.id, since, 200));
        if (!result) return;
        await db.update(teams).set({ healthScore: result.health_score }).where(eq(teams.id, team.id));
        if (!result.conflict_detected) return;
        const open = await db
          .select({ id: conflictAlerts.id })
          .from(conflictAlerts)
          .where(and(eq(conflictAlerts.teamId, team.id), isNull(conflictAlerts.resolvedAt)))
          .limit(1);
        if (open.length) return; // one open alert per team; the instructor resolves it first
        await db.insert(conflictAlerts).values({
          teamId: team.id,
          severity: result.severity,
          summary: result.summary,
          sentiment: result.sentiment,
        });
      });
    }
    return { assessed: active.length };
  },
);

// Every morning (server time, UTC): remind assignees of unfinished tasks due tomorrow. The SQL function
// (migration 0007) writes the notifications and skips any task already reminded for that due date.
export const remindDueTasks = inngest.createFunction(
  { id: "remind-due-tasks", triggers: [{ cron: "0 7 * * *" }] },
  async ({ step }) => {
    const sent = await step.run("send-reminders", async () => {
      const [row] = await db.execute<{ sent: number }>(sql`select public.send_due_reminders() as sent`);
      return row.sent;
    });
    return { sent };
  },
);

// Monday morning (UTC): a recap of last week for every team that chatted or touched its board,
// and a notification to its members.
export const weeklyRecaps = inngest.createFunction(
  { id: "weekly-team-recaps", triggers: [{ cron: "0 6 * * 1" }] },
  async ({ step }) => {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const active = await step.run("active-teams", () =>
      db.selectDistinct({ id: teams.id, name: teams.name }).from(teams)
        .leftJoin(messages, eq(messages.teamId, teams.id))
        .leftJoin(tasks, eq(tasks.teamId, teams.id))
        .where(or(gt(messages.createdAt, since), gt(tasks.updatedAt, since))),
    );
    let written = 0;
    for (const team of active) {
      const ok = await step.run(`recap-${team.id}`, () => summarizeTeamWeek(team.id));
      if (!ok) continue;
      written++;
      await step.run(`notify-${team.id}`, async () => {
        const members = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, team.id));
        if (!members.length) return;
        await db.insert(notifications).values(members.map((m) => ({
          userId: m.userId, type: "system" as const, title: `Weekly recap for ${team.name}`,
          body: "What got done, what is late and what you decided last week.", link: `/student?team=${team.id}&recap=1`,
        })));
      });
    }
    return { teams: active.length, written };
  },
);

// Monday morning (UTC), after the recaps: ask every student in an active course for their stand-up.
export const askForStandups = inngest.createFunction(
  { id: "ask-for-standups", triggers: [{ cron: "5 6 * * 1" }] },
  async ({ step }) => {
    const asked = await step.run("notify-students", async () => {
      const rows = await standupAskees();
      if (!rows.length) return 0;
      await db.insert(notifications).values(rows.map((r) => ({
        userId: r.userId, type: "task" as const, title: `Weekly stand-up for ${r.teamName}`,
        body: "Three quick answers: what you finished, what is next, and anything blocking you.",
        link: `/student?team=${r.teamId}&standup=1`,
      })));
      return rows.length;
    });
    return { asked };
  },
);

// A student answered: once the team's answers settle, the AI writes the instructor's summary.
export const summarizeStandups = inngest.createFunction(
  {
    id: "summarize-standups",
    triggers: [{ event: "standup/answered" }],
    debounce: { key: "event.data.teamId", period: "10m", timeout: "1h" },
  },
  async ({ event, step }) => {
    const teamId = String(event.data.teamId);
    const written = await step.run("summarize", () => summarizeTeamStandup(teamId));
    return { teamId, written };
  },
);

// Every morning (UTC): tell instructors about teams that missed a milestone or have 3+ overdue tasks.
// The SQL function (migration 0017) writes the notifications and sends each alert once.
export const riskAlerts = inngest.createFunction(
  { id: "instructor-risk-alerts", triggers: [{ cron: "15 7 * * *" }] },
  async ({ step }) => {
    const sent = await step.run("send-alerts", async () => {
      const [row] = await db.execute<{ sent: number }>(sql`select public.send_risk_alerts() as sent`);
      return row.sent;
    });
    return { sent };
  },
);

// Every morning (UTC), after the due reminders and risk alerts: one email per person with what they have not read yet.
// Each notification is emailed at most once (notifications.emailed_at).
export const dailyDigests = inngest.createFunction(
  { id: "daily-email-digests", triggers: [{ cron: "30 7 * * *" }] },
  async ({ step }) => {
    const ids = await step.run("recipients", () => digestRecipients());
    let emailed = 0;
    for (const id of ids) emailed += (await step.run(`digest-${id}`, () => sendDigestTo(id))) ? 1 : 0;
    return { recipients: ids.length, emailed };
  },
);

// Every minute: new notifications to the phones and desktops that turned alerts on.
export const pushNotifications = inngest.createFunction(
  { id: "push-notifications", triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => step.run("send-pushes", () => sendPendingPushes()),
);

export const functions = [extractChatTasks, assessTeamHealth, remindDueTasks, riskAlerts, weeklyRecaps, askForStandups, summarizeStandups, dailyDigests, pushNotifications];
