import { expect, test } from "@playwright/test";
import { INSTRUCTOR, signIn } from "./helpers";

test.describe("Instructor pages (read only)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, INSTRUCTOR.email);
  });

  for (const [url, heading] of [
    ["/instructor/analytics", "Analytics"],
    ["/instructor/conflicts", "Conflicts"],
    ["/instructor/matching", "AI team matching"],
    ["/instructor/notifications", "Notifications"],
  ] as const) {
    test(`${heading} page opens`, async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1, name: heading }).filter({ visible: true }).first()).toBeVisible();
    });
  }

  test("the course dashboard lists the seeded course", async ({ page }) => {
    await expect(page).toHaveURL(/\/instructor\/courses/);
    await expect(page.getByText("CSE-3200").first()).toBeVisible();
  });
});
