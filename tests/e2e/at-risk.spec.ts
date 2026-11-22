import { expect, test, type Page } from "@playwright/test";
import { adminRest, courseWithTeam, deleteCourse } from "./helpers";

/** The number on the At risk nav item (the collapsed rail puts it in the label, the open sidebar shows it). */
async function badge(page: Page) {
  const link = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^At risk/ });
  const text = (await link.getAttribute("aria-label")) ?? (await link.innerText());
  return Number(text.match(/(\d+)\s*new/)?.[1] ?? 0);
}

// The daily check needs days of history (it has its own SQL test), so this adds a case for a throwaway team directly.
test("the instructor sees students falling behind, and recoveries move live", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { code, students: [kai] } = await courseWithTeam(page, browser, ["E2E Kai"], "E2E at-risk course");
  const [team] = await adminRest<{ id: string }[]>(`teams?select=id,courses!inner(code)&courses.code=eq.${code}`);
  const [user] = await adminRest<{ id: string }[]>(`users?select=id&email=eq.${encodeURIComponent(kai.email)}`);
  await page.goto("/instructor/at-risk");
  await expect(page.getByRole("heading", { level: 1, name: "At risk" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Open cases" })).toBeVisible(); // loaded
  const before = await badge(page); // other open cases may exist locally
  const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  await adminRest("falling_behind", { method: "POST", body: {
    team_id: team.id, user_id: user.id, reasons: ["3 overdue tasks", "no team chat for 9 days"], flagged_at: days(4), escalated_at: days(1),
  } });

  await expect.poll(() => badge(page)).toBe(before + 1); // live, no reload
  const open = page.getByRole("region", { name: "Open cases" });
  const card = open.getByRole("listitem").filter({ hasText: "E2E Kai" });
  await expect(card.getByText("Needs you")).toBeVisible();
  await expect(card.getByText("3 overdue tasks")).toBeVisible();
  await expect(card.getByText(`E2E Team · ${code}`)).toBeVisible();
  await expect(card.getByRole("link", { name: "Open team" })).toHaveAttribute("href", `/instructor?team=${team.id}`);

  // The student catches up; the next check resolves the case and the page follows without a reload.
  await adminRest(`falling_behind?team_id=eq.${team.id}&user_id=eq.${user.id}`, { method: "PATCH", body: { resolved_at: new Date().toISOString() } });
  await expect(open.getByText("E2E Kai")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Recovered" }).getByText("E2E Kai")).toBeVisible();
  await expect.poll(() => badge(page)).toBe(before);

  // Students can't open it.
  await kai.page.goto("/instructor/at-risk");
  await expect(kai.page).not.toHaveURL(/\/instructor\/at-risk/);

  await deleteCourse(page, code);
});
