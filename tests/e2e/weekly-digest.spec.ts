import { expect, test } from "@playwright/test";
import { adminRest, courseWithTeam, deleteCourse } from "./helpers";

const MAILPIT = "http://127.0.0.1:54324/api/v1";
const isoDay = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// A throwaway course with one of each thing the Monday email reports (cases the daily jobs would make are added
// directly, as in the at-risk test). The email goes to the local Mailpit inbox only, and is deleted after.
test("the instructor's weekly summary lists students falling behind, conflicts, requests for more time and missing hand-ins", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, students: [kai] } = await courseWithTeam(page, browser, ["E2E Kai"], `E2E weekly course ${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Add milestone" }).click();
  const ms = page.getByRole("dialog", { name: "New milestone" });
  await ms.getByLabel("Title").fill("E2E weekly report");
  await ms.getByLabel("Due date").fill(isoDay(-2));
  await ms.getByRole("checkbox", { name: /Teams hand in work/ }).check();
  await ms.getByRole("button", { name: "Add milestone" }).click();
  await expect(ms).toBeHidden();

  const [team] = await adminRest<{ id: string }[]>(`teams?select=id,courses!inner(code)&courses.code=eq.${code}`);
  const [user] = await adminRest<{ id: string }[]>(`users?select=id&email=eq.${encodeURIComponent(kai.email)}`);
  const [milestone] = await adminRest<{ id: string }[]>(`course_milestones?select=id,courses!inner(code)&courses.code=eq.${code}&title=eq.${encodeURIComponent("E2E weekly report")}`);
  await adminRest("falling_behind", { method: "POST", body: { team_id: team.id, user_id: user.id, reasons: ["3 overdue tasks", "no team chat for 9 days"] } });
  await adminRest("conflict_alerts", { method: "POST", body: { team_id: team.id, severity: "medium", summary: "E2E arguing about the API design", sentiment: -0.4 } });
  await adminRest("deadline_extensions", { method: "POST", body: { team_id: team.id, milestone_id: milestone.id, new_date: isoDay(5), reason: "E2E sick", requested_by: user.id } });

  const since = new Date().toISOString();
  await page.goto("/instructor/profile");
  await page.getByRole("button", { name: "Send me this week's summary" }).click();
  await expect(page.getByText(/^Sent this week's summary \(\d+ items?\)/)).toBeVisible();

  // Read it from Mailpit: the newest summary sent just now.
  let id = "";
  await expect.poll(async () => {
    const res = await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent('subject:"your week"')}`)).json() as { messages: { ID: string; Created: string }[] };
    id = res.messages.find((m) => m.Created >= since.slice(0, 19))?.ID ?? "";
    return id;
  }, { timeout: 20_000 }).not.toBe("");
  const mail = await (await fetch(`${MAILPIT}/message/${id}`)).json() as { Subject: string; Text: string };
  await fetch(`${MAILPIT}/messages`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ IDs: [id] }) });
  expect(mail.Subject).toMatch(/^ScholarSync: your week, \d+ things to look at$/);
  expect(mail.Text).toContain(`E2E Kai · E2E Team (${code}): 3 overdue tasks, no team chat for 9 days`);
  expect(mail.Text).toContain(`E2E Team (${code}): E2E arguing about the API design`);
  expect(mail.Text).toMatch(new RegExp(`Requests for more time \\(\\d+\\)[\\s\\S]*E2E Team \\(${code}\\): E2E weekly report, until`));
  expect(mail.Text).toMatch(new RegExp(`Missing hand-ins \\(\\d+\\)[\\s\\S]*E2E Team \\(${code}\\): E2E weekly report, due`));

  await deleteCourse(page, code);
});
