import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Locator } from "@playwright/test";
import { adminRest, courseWithTeam, deleteCourse, PASSWORD, register } from "./helpers";

/** Server-rendered buttons show before they work; under load, click again until the dialog opens. */
const openDialog = (button: Locator, dialog: Locator) =>
  expect(async () => { await button.click(); await expect(dialog).toBeVisible({ timeout: 3_000 }); }).toPass({ timeout: 30_000 });

// Throwaway accounts only: a course with a team of two new students (deleted at the end), and a new "instructor".
test("a student downloads their data, then deletes their account; their team keeps the work", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, students: [ada] } = await courseWithTeam(page, browser, ["E2E Ada", "E2E Ben"], `E2E data course ${Date.now().toString(36)}`);
  const [team] = await adminRest<{ id: string }[]>(`teams?select=id,courses!inner(code)&courses.code=eq.${code}`);
  const [{ id: adaId }] = await adminRest<{ id: string }[]>(`users?select=id&email=eq.${encodeURIComponent(ada.email)}`);
  const [message] = await adminRest<{ id: string }[]>("messages", { method: "POST", body: { team_id: team.id, sender_id: adaId, content: "E2E my draft is in the folder" } });
  const [task] = await adminRest<{ id: string }[]>("tasks", { method: "POST", body: { team_id: team.id, title: "E2E write the intro", assignee_id: adaId } });
  // A pending request for more time that Ada made: deleting her must not touch its state or notify anyone again.
  const [course] = await adminRest<{ id: string; instructor_id: string }[]>(`courses?select=id,instructor_id&code=eq.${code}`);
  const [ms] = await adminRest<{ id: string }[]>("course_milestones", { method: "POST", body: { course_id: course.id, title: "E2E Draft", due_date: "2099-01-01" } });
  await adminRest("deadline_extensions", { method: "POST", body: { team_id: team.id, milestone_id: ms.id, new_date: "2099-01-08", reason: "E2E", requested_by: adaId } });
  const instructorNotes = async () => (await adminRest<unknown[]>(`notifications?select=id&user_id=eq.${course.instructor_id}&link=like.*${course.id}*`)).length;
  const notesBefore = await instructorNotes();

  // Download: a JSON file with her profile, team, task and message.
  await ada.page.goto("/student/profile");
  // The page is server rendered, so the button can show before it works; under load, click again until it does.
  let file!: Download;
  await expect(async () => {
    [file] = await Promise.all([ada.page.waitForEvent("download", { timeout: 5_000 }), ada.page.getByRole("button", { name: "Download my data" }).click()]);
  }).toPass({ timeout: 30_000 });
  expect(file.suggestedFilename()).toMatch(/^scholarsync-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(data.profile).toMatchObject({ name: "E2E Ada", email: ada.email, role: "student" });
  expect(data.teams).toEqual([expect.objectContaining({ team: "E2E Team", course: code })]);
  expect(data.tasks).toEqual([expect.objectContaining({ title: "E2E write the intro", assignedToMe: true })]);
  expect(data.messages).toEqual([expect.objectContaining({ team: "E2E Team", content: "E2E my draft is in the folder" })]);

  // Delete: a wrong email is refused, the right one deletes the account and signs her out.
  const dialog = ada.page.getByRole("dialog", { name: "Delete your account?" });
  await openDialog(ada.page.getByRole("button", { name: "Delete account" }), dialog);
  await dialog.getByLabel("Type your email address to confirm").fill("someone-else@university.edu");
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await expect(dialog.getByText("That isn't the email address of this account.")).toBeVisible();
  await dialog.getByLabel("Type your email address to confirm").fill(ada.email);
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await expect(ada.page).toHaveURL(/\/$/);
  await expect(ada.page.getByText("Your account was deleted")).toBeVisible();

  // She can't sign in again; her profile is gone; the team keeps the message and the task, without her name.
  await ada.page.goto("/login");
  await ada.page.getByLabel("University email").fill(ada.email);
  await ada.page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await ada.page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(ada.page.getByRole("alert").filter({ hasText: /password|credentials/i })).toBeVisible();
  expect(await adminRest(`users?id=eq.${adaId}`)).toEqual([]);
  expect(await adminRest(`messages?select=content,sender_id&id=eq.${message.id}`)).toEqual([{ content: "E2E my draft is in the folder", sender_id: null }]);
  expect(await adminRest(`tasks?select=title,assignee_id&id=eq.${task.id}`)).toEqual([{ title: "E2E write the intro", assignee_id: null }]);
  expect(await adminRest(`deadline_extensions?select=status,requested_by&milestone_id=eq.${ms.id}`)).toEqual([{ status: "pending", requested_by: null }]);
  expect(await instructorNotes()).toBe(notesBefore);

  await deleteCourse(page, code);
});

test("an instructor who still teaches a course can't delete their account", async ({ page }) => {
  const me = await register(page, "E2E Teacher");
  const [{ id }] = await adminRest<{ id: string }[]>(`users?select=id&email=eq.${encodeURIComponent(me.email)}`);
  await adminRest(`users?id=eq.${id}`, { method: "PATCH", body: { role: "instructor" } });
  const courseCode = `E2E-${Date.now().toString(36).toUpperCase()}`;
  await adminRest("courses", { method: "POST", body: { code: courseCode, title: "E2E kept course", term: "Test", instructor_id: id } });

  await page.goto("/instructor/profile");
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await openDialog(page.getByRole("button", { name: "Delete account" }), dialog);
  await dialog.getByLabel("Type your email address to confirm").fill(me.email);
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await expect(dialog.getByText("You teach courses. Delete them first, then your account.")).toBeVisible();
  expect(await adminRest(`users?select=id&id=eq.${id}`)).toEqual([{ id }]);
  await adminRest(`courses?code=eq.${courseCode}`, { method: "DELETE" });
});
