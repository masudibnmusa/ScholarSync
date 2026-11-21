import { expect, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

// A throwaway course and new students. The AI summary itself is not run here (see "Testing the AI features").
test("students answer the weekly stand-up and the instructor reads it", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, students: [ada, ben] } = await courseWithTeam(page, browser, ["E2E Ada", "E2E Ben"], "E2E stand-up course");

  // Ben has the dialog open while Ada answers.
  await ben.page.goto("/student");
  await ben.page.getByRole("button", { name: "Weekly stand-up (not answered yet)" }).click();
  const benDialog = ben.page.getByRole("dialog", { name: "E2E Team's stand-up" });
  await expect(benDialog.getByText("Waiting on E2E Ada.")).toBeVisible();

  // The Monday notification links straight to the dialog.
  await ada.page.goto("/student?standup=1");
  const dialog = ada.page.getByRole("dialog", { name: "E2E Team's stand-up" });
  const send = dialog.getByRole("button", { name: "Send" });
  await expect(send).toBeDisabled(); // nothing answered yet
  await dialog.getByLabel("Done since last week").fill("Finished the login page");
  await dialog.getByLabel("Next up").fill("Start the database schema");
  await dialog.getByLabel("Blocked by").fill("Waiting for the API keys from the instructor");
  await send.click();
  await expect(ada.page.getByText("Stand-up sent")).toBeVisible();
  await expect(dialog.getByText(/^Sent /)).toBeVisible();

  // Ben sees Ada's answers arrive live.
  const adaCard = benDialog.getByRole("listitem").filter({ hasText: "E2E Ada" });
  await expect(adaCard.getByText("Finished the login page")).toBeVisible();
  await expect(adaCard.getByText("Waiting for the API keys from the instructor")).toBeVisible();

  // Ada edits her answer: the button says Update and stays off until something changes.
  const update = dialog.getByRole("button", { name: "Update" });
  await expect(update).toBeDisabled();
  await dialog.getByLabel("Blocked by").fill("Nothing");
  await update.click();
  await expect(ada.page.getByText("Stand-up updated")).toBeVisible();
  await expect(adaCard.getByText("Nothing", { exact: true })).toBeVisible();

  // The instructor reads the answers on the team and can ask for the AI summary.
  await page.goto("/instructor");
  await page.getByLabel("Search teams, students or courses").fill(code);
  await page.getByRole("complementary", { name: "Teams" }).getByRole("button", { name: /E2E Team/ }).click();
  await page.getByRole("button", { name: "Weekly stand-up" }).click();
  const teacher = page.getByRole("dialog", { name: "E2E Team's stand-up" });
  await expect(teacher.getByText("Answers (1 of 2)")).toBeVisible();
  await expect(teacher.getByText("Finished the login page")).toBeVisible();
  await expect(teacher.getByText("Waiting on E2E Ben.")).toBeVisible();
  await expect(teacher.getByRole("button", { name: "Summarise now" })).toBeEnabled();
  await page.keyboard.press("Escape");

  await deleteCourse(page, code);
});
