import { expect, test } from "@playwright/test";
import { adminRest, courseWithTeam, deleteCourse } from "./helpers";

// A throwaway course with history added directly (dates relative to this week's Monday, UTC, as the server counts).
test("analytics trends show each team's weeks", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, students: [ola] } = await courseWithTeam(page, browser, ["E2E Ola"], "E2E trends course");
  const [team] = await adminRest<{ id: string; course_id: string }[]>(`teams?select=id,course_id,courses!inner(code)&courses.code=eq.${code}`);
  const [user] = await adminRest<{ id: string }[]>(`users?select=id&email=eq.${encodeURIComponent(ola.email)}`);
  await adminRest("teams", { method: "POST", body: { course_id: team.course_id, name: "E2E Second" } });

  const now = new Date();
  const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - ((now.getUTCDay() + 6) % 7) * 86_400_000;
  const at = (daysBeforeMonday: number) => new Date(monday - daysBeforeMonday * 86_400_000 + 12 * 3_600_000).toISOString();
  // Two tasks made three weeks ago; one finished two weeks ago (W-2). Three messages last week (W-1).
  const [done] = await adminRest<{ id: string }[]>("tasks", { method: "POST", body: { team_id: team.id, title: "E2E schema", status: "done", created_at: at(17) } });
  await adminRest("tasks", { method: "POST", body: { team_id: team.id, title: "E2E report", created_at: at(17) } });
  await adminRest("task_events", { method: "POST", body: { task_id: done.id, field: "status", old_value: "todo", new_value: "done", created_at: at(10) } });
  await adminRest("messages", { method: "POST", body: [1, 2, 3].map((n) => ({ team_id: team.id, sender_id: user.id, content: `E2E ${n}`, created_at: at(3) })) });
  // Health 70 four weeks ago, 55 last week.
  await adminRest("team_health_history", { method: "POST", body: [{ team_id: team.id, day: at(24).slice(0, 10), score: 70 }, { team_id: team.id, day: at(3).slice(0, 10), score: 55 }] });

  await page.goto("/instructor/analytics");
  const trends = page.getByRole("region", { name: "Trends" });
  await trends.getByRole("combobox", { name: "Course" }).click();
  await page.getByRole("option", { name: code }).click();
  await expect(trends.getByRole("list", { name: "Legend" })).toHaveText(/E2E Second.*E2E Team/);

  const lastFive = async (team: string) => {
    await trends.getByText("Show as a table").click();
    const cells = await trends.getByRole("row", { name: new RegExp(`^${team}`) }).getByRole("cell").allTextContents();
    await trends.getByText("Show as a table").click();
    return cells.slice(-5); // W-4 … this week
  };
  expect(await lastFive("E2E Team")).toEqual(["—", "0%", "50%", "50%", "50%"]);
  expect(await lastFive("E2E Second")).toEqual(["—", "—", "—", "—", "—"]);
  await trends.getByRole("radio", { name: "Tasks done" }).click();
  expect(await lastFive("E2E Team")).toEqual(["0", "0", "1", "0", "0"]);
  await trends.getByRole("radio", { name: "Messages" }).click();
  expect(await lastFive("E2E Team")).toEqual(["0", "0", "0", "3", "0"]);
  await trends.getByRole("radio", { name: "Health" }).click();
  expect(await lastFive("E2E Team")).toEqual(["70", "70", "70", "55", "55"]);

  // Keyboard: the arrow keys read out a week.
  await trends.getByRole("img", { name: /^Health by team/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(trends.locator("[aria-live=polite]")).toHaveText(/: E2E Team 55, E2E Second no data$/);

  await deleteCourse(page, code);
});
