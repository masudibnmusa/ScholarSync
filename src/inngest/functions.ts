import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { inngest } from "./client";
import { adminDb as db } from "@/db";
import { conflictAlerts, messages, taskSuggestions, tasks, teams, users } from "@/db/schema";
import { assessTeam, extractTasks, type ChatLine } from "@/lib/ai";

// These jobs write with the database owner role (bypasses RLS): the "service role writes rows" arrow.

async function recentChat(teamId: string, since?: Date, limit = 40): Promise<ChatLine[]> {
  const rows = await db
    .select({ id: messages.id, content: messages.content, at: messages.createdAt, sender: users.name })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.senderId))
    .where(and(eq(messages.teamId, teamId), since ? gt(messages.createdAt, since.toISOString()) : undefined))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows
    .reverse()
    .filter((r) => r.content.trim())
    .map((r) => ({ id: r.id, content: r.content, at: r.at, sender: r.sender ?? "Unknown" }));
}

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

export const functions = [extractChatTasks, assessTeamHealth];
