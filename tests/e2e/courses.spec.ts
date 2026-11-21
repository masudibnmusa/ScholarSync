import { expect, test, type Browser, type Page } from "@playwright/test";
import { INSTRUCTOR, register, signIn } from "./helpers";

/** A fresh student in their own browser session. */
async function newStudent(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  const account = await register(page, name);
  return { page, ...account };
}

async function openCourse(page: Page, code: string) {
  await page.goto("/instructor/courses");
  await page.getByRole("link", { name: `Course ${code}` }).or(page.getByRole("link").filter({ hasText: "E2E course" })).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E course" })).toBeVisible();
}

// One throwaway course and throwaway students, walked through its whole life. The course is deleted at the end
// (and by global-teardown if the test fails half way).
test("an instructor manages a course from creation to archive", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const code = `E2E-${Date.now().toString(36).toUpperCase()}`;
  const ada = await newStudent(browser, "E2E Ada");
  const ben = await newStudent(browser, "E2E Ben");

  // Create the course.
  await signIn(page, INSTRUCTOR.email);
  await page.getByRole("button", { name: "New course" }).first().click();
  const create = page.getByRole("dialog", { name: "New course" });
  await create.getByLabel("Code").fill(code);
  await create.getByLabel("Title").fill("E2E course");
  await create.getByRole("button", { name: "Create course" }).click();
  await expect(create).toBeHidden();
  await page.getByRole("link", { name: "E2E course" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E course" })).toBeVisible();
  const students = page.getByRole("region", { name: "Students" }).or(page.locator("section[aria-labelledby=students-title]"));
  await expect(students.getByText("No students yet")).toBeVisible();

  // Add students by email: one real student, one unknown address, one instructor account, one typo.
  await students.getByRole("button", { name: "Add students" }).first().click();
  const add = page.getByRole("dialog", { name: `Add students to ${code}` });
  await add.getByLabel("Email addresses").fill(`${ada.email}, nobody-${Date.now()}@university.edu\n${INSTRUCTOR.email}\nnot-an-email`);
  await add.getByRole("button", { name: /Add \d+ students/ }).click();
  await expect(add.getByRole("alert").or(add.getByText("not-an-email")).first()).toBeVisible(); // the typo is caught first
  await add.getByLabel("Email addresses").fill(`${ada.email}, nobody-${Date.now()}@university.edu\n${INSTRUCTOR.email}`);
  await add.getByRole("button", { name: "Add 3 students" }).click();
  await expect(add.getByRole("status")).toContainText("Added");
  await expect(add.getByRole("status")).toContainText(ada.email);
  await expect(add.getByRole("status")).toContainText("No account yet");
  await expect(add.getByRole("status")).toContainText("Not a student account");
  await add.getByRole("button", { name: "Done" }).click();
  const roster = page.getByRole("list", { name: `Students in ${code}` });
  await expect(roster.getByText(ada.email)).toBeVisible();

  // Make a team by hand with Ada.
  await page.getByRole("button", { name: "New team" }).click();
  const teamDialog = page.getByRole("dialog", { name: `New team in ${code}` });
  await teamDialog.getByLabel("Team name").fill("E2E Team");
  await teamDialog.getByRole("checkbox").first().check();
  await teamDialog.getByRole("button", { name: "Create team" }).click();
  await expect(teamDialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 3, name: "E2E Team" })).toBeVisible();
  await expect(roster.getByText("E2E Team")).toBeVisible();

  // Turn joining off: Ben's invite link stops letting him in. Then reset the code.
  await page.getByRole("button", { name: "Invite" }).click();
  const invite = page.getByRole("dialog", { name: `Invite students to ${code}` });
  const oldCode = (await invite.locator("p.font-mono").textContent())!.trim();
  await invite.getByRole("switch", { name: "Accept new students" }).click();
  await expect(invite.getByRole("switch", { name: "Accept new students" })).toHaveAttribute("aria-checked", "false");
  await ben.page.goto(`/join/${oldCode}`);
  await expect(ben.page.getByText("isn't accepting new students")).toBeVisible();
  await expect(ben.page.getByRole("button", { name: "Join course" })).toHaveCount(0);

  await invite.getByRole("switch", { name: "Accept new students" }).click();
  await expect(invite.getByRole("switch", { name: "Accept new students" })).toHaveAttribute("aria-checked", "true");
  await invite.getByRole("button", { name: "Reset code" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset code" }).click();
  await expect(invite.locator("p.font-mono")).not.toHaveText(oldCode);
  await ben.page.goto(`/join/${oldCode}`);
  await expect(ben.page.getByText("This invite doesn't work")).toBeVisible();
  await page.keyboard.press("Escape");

  // Archive: read-only for the instructor and the team.
  await page.getByRole("button", { name: `More actions for ${code}` }).click();
  await page.getByRole("menuitem", { name: "Archive course" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive course" }).click();
  await expect(page.getByText(/^Archived on /)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add students" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New team" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);

  await ada.page.goto("/student");
  await expect(ada.page.getByText(`${code} is archived.`)).toBeVisible();
  await expect(ada.page.getByRole("button", { name: /New task|New/ })).toHaveCount(0);

  // The instructor's dashboard moves it to the Archived shelf.
  await page.goto("/instructor/courses");
  await expect(page.getByRole("link", { name: "E2E course" })).toHaveCount(0);
  await page.getByRole("radio", { name: /Archived/ }).or(page.getByRole("button", { name: /Archived/ })).or(page.getByRole("tab", { name: /Archived/ })).first().click();
  await page.getByRole("link", { name: "E2E course" }).click();

  // Restore, then remove Ada: she leaves the team too.
  await page.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore course" }).click();
  await expect(page.getByText(/^Archived on /)).toBeHidden();
  await page.getByRole("button", { name: `Remove E2E Ada from ${code}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove student" }).click();
  await expect(roster).toBeHidden(); // nobody left: the empty state replaces the list
  await ada.page.goto("/student/courses");
  await expect(ada.page.getByText("E2E course")).toHaveCount(0);

  // Clean up through the UI.
  await page.goto("/instructor/courses");
  await page.getByRole("button", { name: `Options for ${code}` }).click();
  await page.getByRole("menuitem", { name: "Delete course" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete course" }).click();
  await expect(page.getByRole("link", { name: "E2E course" })).toHaveCount(0);
});
