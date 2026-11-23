import { expect, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

// A throwaway course with two new students; deleted at the end (and by global-teardown on failure).
test("a student asks the course, a classmate answers, the asker marks the solution, and it counts for the helper", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, courseUrl, students: [ana, bo] } = await courseWithTeam(page, browser, ["E2E Ana", "E2E Bo"], `E2E help course ${Date.now().toString(36)}`);
  const studentUrl = courseUrl.replace("/instructor/", "/student/");

  // Ana asks.
  await ana.page.goto(studentUrl);
  await ana.page.getByLabel("Your question").fill("E2E how do I seed the database?");
  await ana.page.getByLabel("Details").last().fill("npm run seed fails with a timeout");
  await ana.page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(ana.page.getByRole("button", { name: /E2E how do I seed the database\?/ })).toBeVisible();

  // Bo sees it live and answers.
  await bo.page.goto(studentUrl);
  await bo.page.getByRole("button", { name: /E2E how do I seed the database\?/ }).click();
  await expect(bo.page.getByText("npm run seed fails with a timeout")).toBeVisible();
  await bo.page.getByLabel("Your answer").fill("Start Supabase first: npx supabase start");
  await bo.page.getByRole("button", { name: "Answer", exact: true }).click();

  // Ana opens her question, sees the answer live, and marks it as the solution.
  await ana.page.getByRole("button", { name: /E2E how do I seed the database\?/ }).click();
  const answer = ana.page.getByRole("listitem", { name: "Answer from E2E Bo" });
  await expect(answer.getByText("Start Supabase first: npx supabase start")).toBeVisible();
  await answer.getByRole("button", { name: "Mark as solution" }).click();
  await expect(ana.page.getByRole("listitem", { name: "Solution from E2E Bo" })).toBeVisible();
  await expect(ana.page.getByRole("button", { name: /E2E how do I seed the database\?.*Solved/ })).toBeVisible();

  // Bo is told, and it counts in his contribution report.
  await bo.page.goto("/student/notifications");
  await expect(bo.page.getByText("Your answer solved a question: E2E how do I seed the database?")).toBeVisible();
  await bo.page.goto(studentUrl);
  await bo.page.getByRole("link", { name: "Your contribution" }).click();
  await expect(bo.page.getByText("Help board answers")).toBeVisible();
  await expect(bo.page.getByText("1 solved a classmate's question")).toBeVisible();

  // The instructor sees it and can remove it.
  await page.goto(courseUrl);
  await page.getByRole("button", { name: /E2E how do I seed the database\?/ }).click();
  await page.getByRole("button", { name: "Delete question" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /Delete|Confirm/ }).click();
  await expect(page.getByRole("button", { name: /E2E how do I seed the database\?/ })).toHaveCount(0);

  await deleteCourse(page, code);
});
