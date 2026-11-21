import { expect, test } from "@playwright/test";
import { STUDENT, TEAM_NOVA, signIn } from "./helpers";

test.describe("Student workspace (seeded account, read or self-cleaning)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STUDENT.email);
  });

  test("creates a task on the team board, then deletes it", async ({ page }) => {
    const title = `E2E task ${Date.now()}`;
    await page.goto(`/student?team=${TEAM_NOVA}`);
    await page.getByRole("button", { name: "New task" }).click();
    const dialog = page.getByRole("dialog", { name: "New task" });
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("button", { name: "Create task" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("list", { name: "Tasks" }).getByText(title)).toBeVisible();

    // Clean up through the UI as well.
    await page.getByRole("button", { name: `Actions for ${title}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete task" }).click();
    await expect(page.getByRole("list", { name: "Tasks" }).getByText(title)).toBeHidden();
  });

  test("a task needs a title", async ({ page }) => {
    await page.goto(`/student?team=${TEAM_NOVA}`);
    await page.getByRole("button", { name: "New task" }).click();
    const dialog = page.getByRole("dialog", { name: "New task" });
    await dialog.getByRole("button", { name: "Create task" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
  });

  test("My week shows a live clock and today on the calendar", async ({ page }) => {
    await page.goto("/student/week");
    await expect(page.getByRole("heading", { name: "My week" })).toBeVisible();
    const clock = page.getByRole("region", { name: "Current time" }).locator("time");
    const first = await clock.textContent();
    await expect(clock).not.toHaveText(first ?? "", { timeout: 3_000 }); // it ticks
    const today = page.getByRole("region", { name: "This month" }).locator("[aria-current=date]");
    await expect(today).toHaveText(String(new Date().getDate()));
  });

  test("My week switches between list and month views", async ({ page }) => {
    await page.goto("/student/week");
    await page.getByRole("button", { name: "Month view" }).click();
    await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Current time" })).toBeHidden();
  });

  test("the sidebar opens on hover and closes when the pointer leaves", async ({ page }) => {
    await page.goto("/student/week");
    const sidebar = page.locator("aside", { has: page.getByRole("navigation", { name: "Main" }) });
    const width = async () => (await sidebar.boundingBox())?.width ?? 0;
    const main = page.locator("main");
    const mainLeft = (await main.boundingBox())?.x;

    await page.mouse.move(800, 400);
    await expect.poll(width).toBeLessThan(100);
    await sidebar.hover();
    await expect.poll(width).toBeGreaterThan(200);
    await expect(sidebar.getByText("My week")).toBeVisible();
    expect((await main.boundingBox())?.x).toBe(mainLeft); // opens over the page, doesn't push it
    await page.mouse.move(800, 400);
    await expect.poll(width).toBeLessThan(100);
  });

  test("Ctrl+K opens the command menu", async ({ page }) => {
    await page.goto("/student/week");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
