import { expect, type Page, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

async function newTask(page: Page, title: string, assignee?: string) {
  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill(title);
  if (assignee) {
    await dialog.getByRole("combobox", { name: "Assignee" }).click();
    await page.getByRole("option", { name: assignee }).click();
  }
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();
}

// A throwaway course with two new students; deleted at the end (and by global-teardown on failure).
test("a task waits on another: the board greys it out, loops are refused, and finishing the blocker tells the assignee", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, students: [ana, bo] } = await courseWithTeam(page, browser, ["E2E Ana", "E2E Bo"], `E2E dependency course ${Date.now().toString(36)}`);
  const id = Date.now().toString(36);
  const api = `E2E API ${id}`, ui = `E2E UI ${id}`;

  await ana.page.goto("/student");
  await newTask(ana.page, api);
  await newTask(ana.page, ui, "E2E Bo");

  // The UI waits on the API.
  await ana.page.getByRole("button", { name: `${ui}. Edit task` }).click();
  const edit = ana.page.getByRole("dialog", { name: "Edit task" });
  await expect(edit.getByText("Nothing. Add a task that has to be finished first.")).toBeVisible();
  await edit.getByRole("combobox", { name: "Add a task it waits on" }).click();
  await ana.page.getByRole("option", { name: api }).click();
  await expect(edit.getByRole("list", { name: "Tasks this one waits on" }).getByText(api)).toBeVisible();
  await edit.getByRole("button", { name: "Cancel" }).click();
  const tasks = (p: Page) => p.getByRole("list", { name: "Tasks" });
  await expect(tasks(ana.page).getByRole("listitem").filter({ hasText: ui }).getByText(`Waiting on ${api}`)).toBeVisible();

  // The API can't wait on the UI in turn.
  await ana.page.getByRole("button", { name: `${api}. Edit task` }).click();
  await edit.getByRole("combobox", { name: "Add a task it waits on" }).click();
  await ana.page.getByRole("option", { name: ui }).click();
  await expect(ana.page.getByText("That task already waits on this one.")).toBeVisible();
  await expect(edit.getByText("Nothing. Add a task that has to be finished first.")).toBeVisible();
  await edit.getByRole("button", { name: "Cancel" }).click();

  // Bo sees his task waiting.
  await bo.page.goto("/student");
  const boUi = tasks(bo.page).getByRole("listitem").filter({ hasText: ui });
  await expect(boUi.getByText(`Waiting on ${api}`)).toBeVisible();

  // Ana finishes the API: Bo's task is no longer waiting, live, and he is told it's ready.
  await ana.page.getByRole("button", { name: `Status: To do. Change status of ${api}` }).click();
  await ana.page.getByRole("menuitem", { name: "Done" }).click();
  await expect(boUi.getByText(`Waiting on ${api}`)).toBeHidden();
  await bo.page.goto("/student/notifications");
  await expect(bo.page.getByText(`Ready to start: ${ui}`)).toBeVisible();
  await expect(bo.page.getByText(`${api} is done.`)).toBeVisible();

  await deleteCourse(page, code);
});
