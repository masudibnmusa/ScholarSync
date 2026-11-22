import { expect, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

// Calls Gemini, so it only runs with E2E_AI=1 (see "Testing the AI features"). Throwaway team; nothing is added until confirmed.
test.skip(!process.env.E2E_AI, "Set E2E_AI=1 to run tests that call the AI");

test("meeting notes become reviewed tasks on the board", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { code, students: [ada, ben] } = await courseWithTeam(page, browser, ["E2E Ada", "E2E Ben"], "E2E notes course");

  await ada.page.goto("/student");
  await ada.page.getByRole("button", { name: "From notes" }).click();
  const dialog = ada.page.getByRole("dialog", { name: "Tasks from meeting notes" });
  const find = dialog.getByRole("button", { name: "Find action items" });
  await expect(find).toBeDisabled();
  await dialog.getByLabel("Meeting notes").fill(
    "Sprint planning\n- E2E Ada will set up the Postgres database. Due 2026-12-04.\n- E2E Ben builds the login page, due 2026-12-08.\n" +
    "- Somebody should write the test plan.\n- We agreed to use Tailwind. (decision, not a task)",
  );
  await find.click();
  const items = dialog.getByRole("list", { name: "Action items" }).getByRole("listitem");
  await expect(items).toHaveCount(3, { timeout: 60_000 });

  const db = items.filter({ has: ada.page.locator("input[value*='database' i]") });
  await expect(db.getByRole("combobox")).toHaveText("E2E Ada (you)");
  await expect(db.locator("input[type=date]")).toHaveValue("2026-12-04");
  const login = items.filter({ has: ada.page.locator("input[value*='login' i]") });
  await expect(login.getByRole("combobox")).toHaveText("E2E Ben");
  await expect(login.locator("input[type=date]")).toHaveValue("2026-12-08");
  const plan = items.filter({ has: ada.page.locator("input[value*='test plan' i]") });
  await expect(plan.getByRole("combobox")).toHaveText("Unassigned");

  // Leave the test plan out, then add the other two.
  await plan.getByRole("checkbox").uncheck();
  await dialog.getByRole("button", { name: "Add 2 tasks" }).click();
  await expect(ada.page.getByText("2 tasks added to the board")).toBeVisible();
  await expect(ada.page.getByText(/database/i).first()).toBeVisible();
  await expect(ada.page.getByText(/test plan/i)).toHaveCount(0);

  // Ben sees them live.
  await ben.page.goto("/student");
  await expect(ben.page.getByText(/login page/i).first()).toBeVisible();

  await deleteCourse(page, code);
});
