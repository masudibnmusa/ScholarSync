import { expect, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

const isoDay = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// A throwaway course with two new students; deleted at the end (and by global-teardown on failure).
test("the team ticks the grading rubric before handing in, and teammates see the ticks", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, courseUrl, students: [ana, bo] } = await courseWithTeam(page, browser, ["E2E Ana", "E2E Bo"], `E2E rubric course ${Date.now().toString(36)}`);
  const studentUrl = courseUrl.replace("/instructor/", "/student/");

  // The instructor sets a rubric and a milestone with a hand-in.
  await page.getByRole("button", { name: "Set up rubric" }).click();
  const rubric = page.getByRole("dialog", { name: "Rubric" });
  await rubric.getByLabel("Criterion 1 name").fill("Clear write-up");
  await rubric.getByLabel("Criterion 1 max points").fill("40");
  await rubric.getByRole("button", { name: "Add criterion" }).click();
  await rubric.getByLabel("Criterion 2 name").fill("Tests pass");
  await rubric.getByLabel("Criterion 2 max points").fill("60");
  await rubric.getByRole("button", { name: "Save rubric" }).click();
  await expect(rubric).toBeHidden();
  await page.getByRole("button", { name: "Add milestone" }).click();
  const ms = page.getByRole("dialog", { name: "New milestone" });
  await ms.getByLabel("Title").fill("Report");
  await ms.getByLabel("Due date").fill(isoDay(7));
  await ms.getByRole("checkbox", { name: /Teams hand in work/ }).check();
  await ms.getByRole("button", { name: "Add milestone" }).click();
  await expect(ms).toBeHidden();

  // Ana opens the hand-in and ticks one criterion.
  await ana.page.goto(studentUrl);
  await ana.page.getByRole("button", { name: "Hand in", exact: true }).click();
  const handIn = ana.page.getByRole("dialog", { name: /Hand in: Report/ });
  const list = handIn.getByRole("region", { name: /Check against the rubric/ });
  await expect(list.getByText("0 of 2")).toBeVisible();
  await expect(list.getByText("60 pts")).toBeVisible();
  await list.getByRole("checkbox", { name: "Clear write-up" }).check();
  await expect(list.getByText("1 of 2")).toBeVisible();

  // Bo sees her tick and who made it, and ticks the other.
  await bo.page.goto(studentUrl);
  await bo.page.getByRole("button", { name: "Hand in", exact: true }).click();
  const boList = bo.page.getByRole("dialog", { name: /Hand in: Report/ }).getByRole("region", { name: /Check against the rubric/ });
  await expect(boList.getByRole("checkbox", { name: "Clear write-up" })).toBeChecked();
  await expect(boList.getByText("E2E Ana")).toBeVisible();
  await boList.getByRole("checkbox", { name: "Tests pass" }).check();
  await expect(boList.getByText("2 of 2")).toBeVisible();

  // Ana's open dialog updates live; she unticks hers.
  await expect(list.getByRole("checkbox", { name: "Tests pass" })).toBeChecked();
  await list.getByRole("checkbox", { name: "Clear write-up" }).uncheck();
  await expect(boList.getByText("1 of 2")).toBeVisible();

  await deleteCourse(page, code);
});
