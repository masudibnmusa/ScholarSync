import { expect, test } from "@playwright/test";
import { adminRest, courseWithTeam, deleteCourse, register } from "./helpers";

// A throwaway course and a throwaway staff account (made staff through the admin API, as an administrator would);
// the course is deleted at the end, and global-teardown removes the e2e- accounts.
test("an instructor adds a TA, who sees the course's teams and grades, but can't change the course", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, courseUrl, students: [ana] } = await courseWithTeam(page, browser, ["E2E Ana"], `E2E TA course ${Date.now().toString(36)}`);
  const tara = await (await browser.newContext()).newPage();
  const { email } = await register(tara, "E2E Tara");
  await adminRest(`users?email=eq.${encodeURIComponent(email)}`, { method: "PATCH", body: { role: "instructor" } });

  // The instructor sets a rubric and adds the TA (a student's email is refused).
  await page.getByRole("button", { name: "Set up rubric" }).click();
  const rubric = page.getByRole("dialog", { name: "Rubric" });
  await rubric.getByLabel("Criterion 1 name").fill("Code");
  await rubric.getByLabel("Criterion 1 max points").fill("50");
  await rubric.getByRole("button", { name: "Save rubric" }).click();
  await expect(rubric).toBeHidden();
  await page.getByLabel("TA's email").fill(ana.email);
  await page.getByRole("button", { name: "Add TA" }).click();
  await expect(page.getByText("No staff account has that email.")).toBeVisible();
  await page.getByLabel("TA's email").fill(email);
  await page.getByRole("button", { name: "Add TA" }).click();
  await expect(page.getByRole("list", { name: "Teaching assistants" }).getByText("E2E Tara")).toBeVisible();

  // The TA is told, finds the course, and sees its team, but none of the owner's controls.
  await tara.goto("/instructor/notifications");
  await expect(tara.getByText(`You are a teaching assistant for ${code}`)).toBeVisible();
  await tara.goto("/instructor/courses");
  await expect(tara.getByText(/^Teaching assistant · /)).toBeVisible();
  await tara.goto(courseUrl);
  await expect(tara.getByText(/You're a teaching assistant/)).toBeVisible();
  await expect(tara.getByRole("region", { name: "Teams" }).getByRole("heading", { name: "E2E Team" })).toBeVisible();
  await expect(tara.getByRole("button", { name: "Edit course" })).toHaveCount(0);
  await expect(tara.getByRole("button", { name: /Edit rubric|Set up rubric/ })).toHaveCount(0);
  await expect(tara.getByRole("button", { name: "Release grades" })).toHaveCount(0);
  await expect(tara.getByRole("button", { name: "Add TA" })).toHaveCount(0);
  await expect(tara.getByRole("button", { name: "Add students" })).toHaveCount(0);

  // The TA grades the team; the instructor sees the grade.
  await tara.getByRole("button", { name: "Grade", exact: true }).click();
  const grade = tara.getByRole("dialog", { name: "Grade E2E Team" });
  await grade.getByLabel("Code", { exact: true }).fill("40");
  await grade.getByRole("button", { name: "Save grade" }).click();
  await expect(grade).toBeHidden();
  await expect(tara.getByText("Team grade 80%")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Team grade 80%")).toBeVisible();

  // Removing the TA ends access.
  await page.getByRole("button", { name: "Remove E2E Tara as TA" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("list", { name: "Teaching assistants" })).toHaveCount(0);
  await tara.reload();
  await expect(tara.getByRole("button", { name: "Grade", exact: true })).toHaveCount(0);

  await deleteCourse(page, code);
});
