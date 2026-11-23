import { expect, type Page, test } from "@playwright/test";
import { courseWithTeam, deleteCourse, register } from "./helpers";

const isoDay = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function pastMilestone(page: Page, title: string) {
  await page.getByRole("button", { name: "Add milestone" }).click();
  const ms = page.getByRole("dialog", { name: "New milestone" });
  await ms.getByLabel("Title").fill(title);
  await ms.getByLabel("Due date").fill(isoDay(-1));
  await ms.getByRole("button", { name: "Add milestone" }).click();
  await expect(ms).toBeHidden();
}

async function writeRetro(page: Page, studentUrl: string, wentWell: string, didnt: string) {
  await page.goto(studentUrl);
  await page.getByRole("button", { name: "Retrospective" }).click();
  const dialog = page.getByRole("dialog", { name: /Retrospective: / });
  await dialog.getByLabel("What went well?").fill(wentWell);
  await dialog.getByLabel("What didn't?").fill(didnt);
  await dialog.getByRole("button", { name: "Save retrospective" }).click();
  await expect(dialog).toBeHidden();
}

// A throwaway course with two new students; deleted at the end (and by global-teardown on failure).
test("after a milestone the team writes one shared retrospective, and the instructor reads it", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, courseUrl, students: [ana, bo] } = await courseWithTeam(page, browser, ["E2E Ana", "E2E Bo"], `E2E retro course ${Date.now().toString(36)}`);
  const studentUrl = courseUrl.replace("/instructor/", "/student/");
  await pastMilestone(page, "E2E demo day");
  await expect(page.getByRole("button", { name: /^Retros/ })).toHaveCount(0); // none written yet

  // Ana writes it; Bo opens the same one and adds to it.
  await writeRetro(ana.page, studentUrl, "We split the work early", "");
  await bo.page.goto(studentUrl);
  await bo.page.getByRole("button", { name: "Retrospective" }).click();
  const dialog = bo.page.getByRole("dialog", { name: "Retrospective: E2E demo day" });
  await expect(dialog.getByLabel("What went well?")).toHaveValue("We split the work early");
  await expect(dialog.getByText(/Last edited by E2E Ana/)).toBeVisible();
  await dialog.getByLabel("What didn't?").fill("We merged at the last minute");
  await dialog.getByRole("button", { name: "Save retrospective" }).click();
  await expect(dialog).toBeHidden();

  // The instructor sees it live and reads it.
  await page.getByRole("button", { name: /^Retros 1\/1/ }).click();
  const review = page.getByRole("dialog", { name: "Retrospectives: E2E demo day" });
  const entry = review.getByRole("listitem", { name: "Retrospective from E2E Team" });
  await expect(entry.getByText("We split the work early")).toBeVisible();
  await expect(entry.getByText("We merged at the last minute")).toBeVisible();
  await expect(review.getByText("1 of 1 teams wrote one.")).toBeVisible();
  await page.keyboard.press("Escape");

  await deleteCourse(page, code);
});

test.describe("with the AI", () => {
  test.skip(!process.env.E2E_AI, "Set E2E_AI=1 to run tests that call the AI");

  test("the instructor finds themes across two teams' retrospectives", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const { code, courseUrl, students: [ana] } = await courseWithTeam(page, browser, ["E2E Ana"], `E2E retro themes ${Date.now().toString(36)}`);
    const studentUrl = courseUrl.replace("/instructor/", "/student/");
    // A second team with a second student.
    const cy = await (await browser.newContext()).newPage();
    const { email } = await register(cy, "E2E Cy");
    await page.getByRole("button", { name: "Add students" }).first().click();
    const add = page.getByRole("dialog", { name: `Add students to ${code}` });
    await add.getByLabel("Email addresses").fill(email);
    await add.getByRole("button", { name: /^Add 1 student$/ }).click();
    await add.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "New team" }).click();
    const team = page.getByRole("dialog", { name: `New team in ${code}` });
    await team.getByLabel("Team name").fill("E2E Team Two");
    await team.getByRole("checkbox", { name: /E2E Cy/ }).check();
    await team.getByRole("button", { name: "Create team" }).click();
    await expect(team).toBeHidden();
    await pastMilestone(page, "E2E sprint one");

    await writeRetro(ana.page, studentUrl, "Daily stand-ups kept us in sync", "Merge conflicts at the end");
    await writeRetro(cy, studentUrl, "Short daily check-ins helped", "Lots of merge conflicts near the deadline");

    await page.getByRole("button", { name: /^Retros 2\/2/ }).click();
    const review = page.getByRole("dialog", { name: "Retrospectives: E2E sprint one" });
    await review.getByRole("button", { name: "Find themes" }).click();
    const didnt = review.getByRole("list", { name: "Didn't go well" });
    await expect(didnt.getByRole("listitem").first()).toBeVisible({ timeout: 90_000 });
    await expect(didnt.getByText(/E2E Team, E2E Team Two|E2E Team Two, E2E Team/)).toBeVisible(); // both teams mentioned merges
    await page.keyboard.press("Escape");

    await deleteCourse(page, code);
  });
});
