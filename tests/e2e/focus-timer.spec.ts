import { expect, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

// A throwaway course with two new students; deleted at the end (and by global-teardown on failure).
test("a student focuses on a task for 25 minutes, and the time shows on the task and in the contribution report", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, courseUrl, students: [ana, bo] } = await courseWithTeam(page, browser, ["E2E Ana", "E2E Bo"], `E2E focus course ${Date.now().toString(36)}`);
  const title = `E2E focus task ${Date.now().toString(36)}`;

  await ana.page.goto("/student");
  await ana.page.getByRole("button", { name: "New task" }).click();
  const create = ana.page.getByRole("dialog", { name: "New task" });
  await create.getByLabel("Title").fill(title);
  await create.getByRole("button", { name: "Create task" }).click();
  await expect(create).toBeHidden();

  // Start the timer from the task; it keeps running beside the board after the dialog closes.
  await ana.page.getByRole("button", { name: `${title}. Edit task` }).click();
  const edit = ana.page.getByRole("dialog", { name: "Edit task" });
  await expect(edit.getByText("No focus time yet")).toBeVisible();
  await edit.getByRole("button", { name: "Focus for 25 minutes" }).click();
  await expect(edit.getByText("Timer running")).toBeVisible();
  await edit.getByRole("button", { name: "Cancel" }).click();
  const timer = ana.page.getByRole("group", { name: "Focus timer" });
  await expect(timer.getByText(title)).toBeVisible();
  await expect(timer.getByLabel(/^2[45]:\d\d left$/)).toBeVisible();

  // 25 minutes pass (the timer lives in localStorage, so a reload keeps it): the session is saved.
  await ana.page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem("scholarsync:focus")!);
    localStorage.setItem("scholarsync:focus", JSON.stringify({ ...r, startedAt: r.startedAt - 25 * 60_000 }));
  });
  await ana.page.reload();
  await expect(ana.page.getByText(`Focus session saved: 25 min on ${title}`)).toBeVisible();
  await expect(timer).toBeHidden();
  const row = ana.page.getByRole("list", { name: "Tasks" }).getByRole("listitem").filter({ hasText: title });
  await expect(row.getByText("25 min")).toBeVisible();

  // The teammate sees the time on the task.
  await bo.page.goto("/student");
  await expect(bo.page.getByRole("list", { name: "Tasks" }).getByRole("listitem").filter({ hasText: title }).getByText("25 min")).toBeVisible();

  // Stopping before a minute has passed saves nothing.
  await ana.page.getByRole("button", { name: `${title}. Edit task` }).click();
  await expect(edit.getByText("25 min spent so far")).toBeVisible();
  await edit.getByRole("button", { name: "Focus for 25 minutes" }).click();
  await edit.getByRole("button", { name: "Cancel" }).click();
  await timer.getByRole("button", { name: "Stop" }).click();
  await expect(timer).toBeHidden();
  await expect(row.getByText("25 min")).toBeVisible();

  // The contribution report counts it.
  await ana.page.goto(courseUrl.replace("/instructor/", "/student/"));
  await ana.page.getByRole("link", { name: "Your contribution" }).click();
  await expect(ana.page.getByText("Focus time", { exact: true })).toBeVisible();
  await expect(ana.page.getByText("on the focus timer, on team tasks")).toBeVisible();

  await deleteCourse(page, code);
});
