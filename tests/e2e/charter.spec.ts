import { expect, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

// Two new students on a throwaway team write and agree to a charter; the instructor reads it.
test("a team writes its charter, everyone agrees, and an edit asks again", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, students: [ana, bo] } = await courseWithTeam(page, browser, ["E2E Ana", "E2E Bo"], "E2E charter course");

  await bo.page.goto("/student");
  await expect(bo.page.getByRole("button", { name: "Team charter (not written yet)" })).toBeVisible();

  // Ana writes it.
  await ana.page.goto("/student");
  await ana.page.getByRole("button", { name: "Team charter (not written yet)" }).click();
  const dialog = ana.page.getByRole("dialog", { name: "E2E Team's charter" });
  const save = dialog.getByRole("button", { name: "Save charter" });
  await expect(save).toBeDisabled();
  await dialog.getByLabel("Roles").fill("Ana: backend. Bo: UI and the report.");
  await dialog.getByLabel("Meeting times").fill("Tuesdays 6pm online");
  await save.click();
  await expect(ana.page.getByText("Charter saved")).toBeVisible();
  await expect(dialog.getByText("Tuesdays 6pm online")).toBeVisible();
  await expect(dialog.getByText("Not decided yet")).toHaveCount(2); // missed work, communication
  const anaAgreed = dialog.getByRole("region", { name: /^Agreed/ });
  await expect(anaAgreed.getByRole("heading")).toHaveText("Agreed (1 of 2)");
  await expect(anaAgreed.getByRole("listitem").filter({ hasText: "E2E Ana" })).toContainText("Agreed");
  await expect(anaAgreed.getByRole("listitem").filter({ hasText: "E2E Bo" })).toContainText("Not yet");

  // Bo is notified, opens it from the notification and agrees; Ana sees it live.
  await bo.page.goto("/student/notifications");
  await bo.page.getByText("E2E Ana wrote your team charter").click();
  const boDialog = bo.page.getByRole("dialog", { name: "E2E Team's charter" });
  await expect(boDialog.getByText("Ana: backend. Bo: UI and the report.")).toBeVisible();
  await boDialog.getByRole("button", { name: "I agree" }).click();
  await expect(boDialog.getByRole("button", { name: "I agree" })).toHaveCount(0);
  await expect(anaAgreed.getByRole("heading")).toHaveText("Agreed (2 of 2)");

  // Bo edits it: Ana is asked to agree again.
  await boDialog.getByRole("button", { name: "Edit" }).click();
  await boDialog.getByLabel("When work is missed").fill("Say so in chat a day before the deadline");
  await boDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(bo.page.getByText("Charter updated")).toBeVisible();
  await expect(anaAgreed.getByRole("listitem").filter({ hasText: "E2E Ana" })).toContainText("Not yet");
  await expect(dialog.getByText("Say so in chat a day before the deadline")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "I agree" })).toBeVisible();
  await ana.page.keyboard.press("Escape");
  await expect(ana.page.getByRole("button", { name: "Team charter (waiting for you to agree)" })).toBeVisible();

  // The instructor reads it, without edit or agree buttons.
  await page.goto("/instructor");
  await page.getByLabel("Search teams, students or courses").fill(code);
  await page.getByRole("complementary", { name: "Teams" }).getByRole("button", { name: /E2E Team/ }).click();
  await page.getByRole("button", { name: "Team charter" }).click();
  const teacher = page.getByRole("dialog", { name: "E2E Team's charter" });
  await expect(teacher.getByText("Last changed just now by E2E Bo")).toBeVisible();
  await expect(teacher.getByRole("region", { name: /^Agreed/ }).getByRole("heading")).toHaveText("Agreed (1 of 2)");
  await expect(teacher.getByRole("button", { name: /Edit|I agree/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await deleteCourse(page, code);
});
