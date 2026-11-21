import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

// A throwaway course with two new students; the instructor sets a rubric, grades the team and exports the gradebook.
test("the instructor grades a team and exports the gradebook as CSV", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { code, students: [ivy, leo] } = await courseWithTeam(page, browser, ["E2E Ivy", "E2E Leo"], "E2E grading course");

  await page.getByRole("button", { name: "Set up rubric" }).click();
  const rubric = page.getByRole("dialog", { name: "Rubric" });
  await rubric.getByLabel("Criterion 1 name").fill("Code");
  await rubric.getByLabel("Criterion 1 max points").fill("40");
  await rubric.getByRole("button", { name: "Add criterion" }).click();
  await rubric.getByLabel("Criterion 2 name").fill("Report");
  await rubric.getByLabel("Criterion 2 max points").fill("60");
  await rubric.getByRole("button", { name: "Save rubric" }).click();
  await expect(rubric).toBeHidden();
  await expect(page.getByRole("button", { name: "Export gradebook" })).toHaveCount(0); // nothing graded yet

  await page.getByRole("button", { name: "Grade", exact: true }).click();
  const grade = page.getByRole("dialog", { name: "Grade E2E Team" });
  await grade.getByLabel("Code", { exact: true }).fill("30");
  await grade.getByLabel("Report", { exact: true }).fill("54");
  await grade.getByLabel("Override factor for E2E Leo").fill("0.9");
  await grade.getByRole("button", { name: "Save grade" }).click();
  await expect(grade).toBeHidden();
  await expect(page.getByText("Team grade 84%")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export gradebook" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(new RegExp(`^${code}-gradebook-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
  const lines = (await readFile(await file.path(), "utf8")).replace(/^﻿/, "").split("\r\n");
  expect(lines[0]).toBe("Student,Email,Team,Code (/40),Report (/60),Team grade (%),Contribution factor,Final grade (%)");
  expect(lines.slice(1)).toEqual([
    `E2E Ivy,${ivy.email},E2E Team,30,54,84,1,84`,
    `E2E Leo,${leo.email},E2E Team,30,54,84,0.9,75.6`,
  ]);

  await deleteCourse(page, code);
});
