import path from "node:path";
import { expect, test } from "@playwright/test";
import { INSTRUCTOR, register, signIn } from "./helpers";

const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// A throwaway course with one team of one new student; deleted at the end (and by global-teardown on failure).
test("a team hands in work, late, and the instructor gives feedback", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const code = `E2E-${Date.now().toString(36).toUpperCase()}`;
  const ada = await (await browser.newContext()).newPage();
  const adaAccount = await register(ada, "E2E Ada");

  // Instructor: course, student, team, and a hand-in milestone that was due yesterday.
  await signIn(page, INSTRUCTOR.email);
  await page.getByRole("button", { name: "New course" }).first().click();
  const create = page.getByRole("dialog", { name: "New course" });
  await create.getByLabel("Code").fill(code);
  await create.getByLabel("Title").fill("E2E hand-in course");
  await create.getByRole("button", { name: "Create course" }).click();
  await page.getByRole("link", { name: "E2E hand-in course" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E hand-in course" })).toBeVisible();
  const courseUrl = page.url();

  await page.getByRole("button", { name: "Add students" }).first().click();
  const add = page.getByRole("dialog", { name: `Add students to ${code}` });
  await add.getByLabel("Email addresses").fill(adaAccount.email);
  await add.getByRole("button", { name: "Add 1 student" }).click();
  await add.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "New team" }).click();
  const team = page.getByRole("dialog", { name: `New team in ${code}` });
  await team.getByLabel("Team name").fill("E2E Team");
  await team.getByRole("checkbox").first().check();
  await team.getByRole("button", { name: "Create team" }).click();
  await expect(team).toBeHidden();

  await page.getByRole("button", { name: "Add milestone" }).click();
  const ms = page.getByRole("dialog", { name: "New milestone" });
  await ms.getByLabel("Title").fill("Proposal");
  await ms.getByLabel("Due date").fill(isoDay(-1));
  await ms.getByRole("checkbox", { name: /Teams hand in work/ }).check();
  await ms.getByRole("button", { name: "Add milestone" }).click();
  await expect(ms).toBeHidden();
  await expect(page.getByText("Hand-in", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Hand-ins for Proposal" }).getByText("E2E Team")).toBeVisible();

  // Student: an empty hand-in is refused, then a file + link + note goes in, marked late.
  await ada.goto(courseUrl.replace("/instructor/", "/student/"));
  await ada.getByRole("button", { name: "Hand in", exact: true }).click();
  const handIn = ada.getByRole("dialog", { name: /Hand in: Proposal/ });
  await expect(handIn.getByText("The due date has passed")).toBeVisible();
  await handIn.getByRole("button", { name: "Hand in", exact: true }).click();
  await expect(handIn.getByText("Attach a file or add a link.")).toBeVisible();
  await handIn.getByLabel("Link").fill("not a link");
  await handIn.getByRole("button", { name: "Hand in", exact: true }).click();
  await expect(handIn.getByText("Use a web link starting with http:// or https://")).toBeVisible();
  await handIn.locator("#handin-file").setInputFiles(path.join(__dirname, "fixtures/photo.png"));
  await handIn.getByLabel("Link").fill("https://github.com/e2e/proposal");
  await handIn.getByLabel("Note to your instructor").fill("Draft one");
  await handIn.getByRole("button", { name: "Hand in", exact: true }).click();
  await expect(handIn).toBeHidden();
  await expect(ada.getByText("Late", { exact: true })).toBeVisible();
  await expect(ada.getByRole("button", { name: /photo\.png/ })).toBeVisible();
  await expect(ada.getByRole("link", { name: "github.com/e2e/proposal" })).toBeVisible();

  // Instructor: sees it as late, reviews it and leaves feedback.
  await page.reload();
  const chips = page.getByRole("list", { name: "Hand-ins for Proposal" });
  await expect(chips.getByText("Handed in late")).toBeAttached();
  await page.getByRole("button", { name: /Review/ }).click();
  const review = page.getByRole("dialog", { name: "Hand-ins: Proposal" });
  await expect(review.getByText("1 of 1 teams handed in")).toBeVisible();
  await expect(review.getByText("Draft one")).toBeVisible();
  await review.getByLabel("Feedback to E2E Team").fill("Clear problem statement. Add user research.");
  await review.getByRole("button", { name: "Save feedback" }).click();
  await expect(page.getByText("Feedback saved for E2E Team")).toBeVisible();
  await page.keyboard.press("Escape");

  // Student: sees the feedback, hands in a new version (link only); the feedback is marked as on an earlier version.
  await ada.reload();
  await expect(ada.getByText("Clear problem statement. Add user research.")).toBeVisible();
  await ada.getByRole("button", { name: "New version" }).click();
  const again = ada.getByRole("dialog", { name: /Hand in a new version: Proposal/ });
  await again.getByRole("button", { name: "Remove photo.png" }).click();
  await again.getByLabel("Link").fill("https://github.com/e2e/proposal-v2");
  await again.getByRole("button", { name: "Hand in new version" }).click();
  await expect(again).toBeHidden();
  await expect(ada.getByRole("link", { name: "github.com/e2e/proposal-v2" })).toBeVisible();
  await expect(ada.getByRole("button", { name: /photo\.png/ })).toHaveCount(0);
  await expect(ada.getByText("on an earlier version")).toBeVisible();

  // Both sides were notified.
  await ada.goto("/student/notifications");
  await expect(ada.getByText("Feedback on Proposal")).toBeVisible();
  await page.goto("/instructor/notifications");
  await expect(page.getByText("E2E Team resubmitted Proposal").first()).toBeVisible();

  // Clean up.
  await page.goto("/instructor/courses");
  await page.getByRole("button", { name: `Options for ${code}` }).click();
  await page.getByRole("menuitem", { name: "Delete course" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete course" }).click();
  await expect(page.getByRole("link", { name: "E2E hand-in course" })).toHaveCount(0);
});
