import { expect, type Page, test } from "@playwright/test";
import { courseWithTeam, deleteCourse, register } from "./helpers";

const isoDay = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const essay = "Our system stores each order in a queue and a worker charges the card, then emails the receipt to the customer when payment succeeds.";

async function handIn(page: Page, studentUrl: string, file: { name: string; text: string }, link: string) {
  await page.goto(studentUrl);
  await page.getByRole("button", { name: "Hand in", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Hand in: Report/ });
  await dialog.locator("#handin-file").setInputFiles({ name: file.name, mimeType: "text/plain", buffer: Buffer.from(file.text) });
  await dialog.getByLabel("Link").fill(link);
  await dialog.getByRole("button", { name: "Hand in", exact: true }).click();
  await expect(dialog).toBeHidden();
}

// A throwaway course with two teams of new students; deleted at the end (and by global-teardown on failure).
test("the instructor compares hand-ins and two teams with the same text and link are flagged", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { code, courseUrl, students: [ana] } = await courseWithTeam(page, browser, ["E2E Ana"], `E2E similarity course ${Date.now().toString(36)}`);
  const studentUrl = courseUrl.replace("/instructor/", "/student/");
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
  await page.getByRole("button", { name: "Add milestone" }).click();
  const ms = page.getByRole("dialog", { name: "New milestone" });
  await ms.getByLabel("Title").fill("Report");
  await ms.getByLabel("Due date").fill(isoDay(7));
  await ms.getByRole("checkbox", { name: /Teams hand in work/ }).check();
  await ms.getByRole("button", { name: "Add milestone" }).click();
  await expect(ms).toBeHidden();

  await handIn(ana.page, studentUrl, { name: "report.md", text: `# Report\n\n${essay}` }, "https://github.com/e2e/shop");
  await handIn(cy, studentUrl, { name: "notes.txt", text: `${essay} We also wrote tests for refunds.` }, "https://www.github.com/e2e/shop/");

  await page.reload();
  await page.getByRole("button", { name: /^Review/ }).click();
  const review = page.getByRole("dialog", { name: "Hand-ins: Report" });
  await review.getByRole("button", { name: "Compare hand-ins" }).click();
  const flagged = review.getByRole("list", { name: "Similar hand-ins" }).getByRole("listitem");
  await expect(flagged).toHaveCount(1);
  await expect(flagged).toContainText(/E2E Team (and|ও) E2E Team Two|E2E Team Two and E2E Team/);
  await expect(flagged).toContainText("the same link");
  await expect(flagged).toContainText(/(9\d|100)% of the text matches/); // the heading in one file adds a few words
  await page.keyboard.press("Escape");

  await deleteCourse(page, code);
});
