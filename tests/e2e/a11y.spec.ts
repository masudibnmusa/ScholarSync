import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { INSTRUCTOR, STUDENT, signIn } from "./helpers";

// axe checks every page against WCAG 2.2 A and AA (contrast, names, labels, target size, ARIA…), in both themes.
// Read only: the seeded accounts are signed in and pages are opened, nothing is changed.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PUBLIC = ["/", "/login", "/register"];
const STUDENT_PAGES = ["/student/courses", "/student", "/student/week", "/student/peer-review", "/student/notifications", "/student/profile",
  "/student/courses/00000000-0000-4000-9000-000000000001"];
const INSTRUCTOR_PAGES = ["/instructor/courses", "/instructor", "/instructor/analytics", "/instructor/at-risk", "/instructor/conflicts",
  "/instructor/matching", "/instructor/notifications", "/instructor/profile", "/instructor/courses/00000000-0000-4000-9000-000000000001"];

/** Opens each page and collects axe's findings as readable lines (rule, how bad, where). */
async function scan(page: Page, urls: string[]) {
  const problems: string[] = [];
  for (const url of urls) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 }).filter({ visible: true }).first()).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => {}); // data that loads after the page (lists, charts)
    // Page and card entrances fade in (framer-motion animates opacity even with reduced motion): measure when settled.
    await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== "running"));
    await page.waitForTimeout(400);
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    for (const v of violations) {
      for (const n of v.nodes) problems.push(`${url} · ${v.id} (${v.impact}): ${n.target.join(" ")}\n    ${n.failureSummary?.split("\n").slice(1).join(" ").trim()}`);
    }
  }
  return problems;
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`Accessibility, ${theme} theme`, () => {
    test.use({ colorScheme: theme, reducedMotion: "reduce" }); // measure the settled page, not text mid fade-in
    test.setTimeout(180_000);

    test("public pages", async ({ page }) => {
      expect(await scan(page, PUBLIC)).toEqual([]);
    });
    test("student pages", async ({ page }) => {
      await signIn(page, STUDENT.email);
      expect(await scan(page, STUDENT_PAGES)).toEqual([]);
    });
    test("instructor pages", async ({ page }) => {
      await signIn(page, INSTRUCTOR.email);
      expect(await scan(page, INSTRUCTOR_PAGES)).toEqual([]);
    });
  });
}
