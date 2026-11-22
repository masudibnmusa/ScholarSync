import { expect, test, type Page } from "@playwright/test";
import { INSTRUCTOR, STUDENT, signIn } from "./helpers";

// Read only: the seeded accounts are signed in and pages are opened, nothing is changed.
// The browser runs in a time zone far from the server's, so anything rendered on the server from the clock would differ.
test.use({ timezoneId: "Pacific/Kiritimati" }); // UTC+14

/** The page as the server sends it, before any script runs (same cookies as the signed-in page). */
const serverHtml = async (page: Page, url: string) => (await (await page.request.get(url)).text()).replace(/<script[\s\S]*?<\/script>/g, "");

function watchHydration(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /hydrat|did not match/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => { if (/hydrat|did not match/i.test(e.message)) errors.push(e.message); });
  return errors;
}

test("a student's pages arrive with their data and hydrate cleanly", async ({ page }) => {
  await signIn(page, STUDENT.email);
  expect(await serverHtml(page, "/student/courses")).toContain("Software Engineering Project");
  const workspace = await serverHtml(page, "/student");
  expect(workspace).toContain("Switch team. Current:"); // the team's board header, not the loading skeleton
  expect(workspace).not.toContain("Loading your workspace");

  const errors = watchHydration(page);
  for (const url of ["/student/courses", "/student", "/student/week", "/student/chat", "/student/files", "/student/peer-review", "/student/notifications", "/student/profile"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 }).filter({ visible: true }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("an instructor's pages arrive with their data and hydrate cleanly", async ({ page }) => {
  await signIn(page, INSTRUCTOR.email);
  expect(await serverHtml(page, "/instructor/courses")).toContain("Software Engineering Project");
  const workspace = await serverHtml(page, "/instructor");
  expect(workspace).not.toContain("Loading teams");
  expect(workspace).toContain("Team Nova"); // the team list

  const errors = watchHydration(page);
  for (const url of ["/instructor/courses", "/instructor", "/instructor/analytics", "/instructor/at-risk", "/instructor/conflicts", "/instructor/matching", "/instructor/notifications", "/instructor/profile"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 }).filter({ visible: true }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});
