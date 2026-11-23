import { expect, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

test.skip(!process.env.E2E_AI, "Set E2E_AI=1 to run tests that call the AI");

// A throwaway course with one new student; deleted at the end (and by global-teardown on failure).
test("a student asks the study buddy, and the answer cites the announcement it came from", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, courseUrl, students: [ana] } = await courseWithTeam(page, browser, ["E2E Ana"], `E2E study course ${Date.now().toString(36)}`);

  await page.getByLabel("Announcement title").fill("E2E lab moved to room 402");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByText("E2E lab moved to room 402")).toBeVisible();

  await ana.page.goto(courseUrl.replace("/instructor/", "/student/"));
  await ana.page.getByLabel("Ask about this course").fill("Which room is the lab in now?");
  await ana.page.getByRole("button", { name: "Ask the study buddy" }).click();
  const answers = ana.page.getByRole("list", { name: "Study buddy answers" });
  const sources = answers.getByRole("list", { name: "Sources" });
  await expect(sources.getByRole("link", { name: "E2E lab moved to room 402" })).toBeVisible({ timeout: 90_000 });
  await expect(answers.getByRole("paragraph").filter({ hasText: /402/ })).toBeVisible(); // the answer itself, not just the source
  await expect(answers.getByRole("link", { name: "source 1" })).toBeVisible();

  await deleteCourse(page, code);
});
