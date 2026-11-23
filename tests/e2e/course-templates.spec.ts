import { expect, type Page, test } from "@playwright/test";
import { INSTRUCTOR, deleteCourse, signIn } from "./helpers";

const isoDay = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function newCourse(page: Page, code: string, title: string, copyFrom?: string) {
  await page.goto("/instructor/courses");
  await page.getByRole("button", { name: "New course" }).first().click();
  const create = page.getByRole("dialog", { name: "New course" });
  if (copyFrom) {
    await create.getByRole("combobox", { name: /Copy from/ }).click();
    await page.getByRole("option", { name: new RegExp(copyFrom) }).click();
    await expect(create.getByText(/Milestone dates move forward/)).toBeVisible();
  }
  await create.getByLabel("Code").fill(code);
  await create.getByLabel("Title").fill(title);
  await create.getByRole("button", { name: "Create course" }).click();
  await expect(create).toBeHidden();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

// Two throwaway courses of the seeded instructor; both deleted at the end (and by global-teardown on failure).
test("an instructor starts a new course from an earlier one, with its milestones, rubric and announcements", async ({ page }) => {
  test.setTimeout(120_000);
  const id = Date.now().toString(36).toUpperCase();
  const [oldCode, newCode] = [`E2E-${id}A`, `E2E-${id}B`];
  await signIn(page, INSTRUCTOR.email);

  // Last term's course.
  await newCourse(page, oldCode, `E2E template course ${id}`);
  await page.getByLabel("Announcement title").fill("E2E welcome to the course");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByText("E2E welcome to the course")).toBeVisible();
  await page.getByRole("button", { name: "Add milestone" }).click();
  const ms = page.getByRole("dialog", { name: "New milestone" });
  await ms.getByLabel("Title").fill("E2E proposal");
  await ms.getByLabel("Due date").fill(isoDay(14));
  await ms.getByRole("checkbox", { name: /Teams hand in work/ }).check();
  await ms.getByRole("button", { name: "Add milestone" }).click();
  await expect(ms).toBeHidden();
  await page.getByRole("button", { name: "Set up rubric" }).click();
  const rubric = page.getByRole("dialog", { name: "Rubric" });
  await rubric.getByLabel("Criterion 1 name").fill("E2E design");
  await rubric.getByLabel("Criterion 1 max points").fill("30");
  await rubric.getByRole("button", { name: "Save rubric" }).click();
  await expect(rubric).toBeHidden();

  // This term's course, copied from it: created the same week, so the dates stay.
  await newCourse(page, newCode, `E2E next term ${id}`, oldCode);
  await expect(page.getByText("E2E welcome to the course")).toBeVisible();
  await expect(page.getByText("E2E proposal")).toBeVisible();
  await expect(page.getByText("Hand-in", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit rubric" }).click();
  await expect(page.getByRole("dialog", { name: "Rubric" }).getByLabel("Criterion 1 name")).toHaveValue("E2E design");
  await page.keyboard.press("Escape");

  await deleteCourse(page, newCode);
  await deleteCourse(page, oldCode);
});
