import { expect, type Browser, type Page } from "@playwright/test";

export const PASSWORD = "password123";
export const STUDENT = { email: "masud@university.edu", name: "Masud Ibn Musa" };
export const INSTRUCTOR = { email: "selim.reja@university.edu", name: "Selim Reja" };
export const TEAM_NOVA = "00000000-0000-4000-a000-000000000001"; // seed: masud, nazmul, chinmoy

/** Accounts made by tests start with this, so global-teardown can delete them. */
export const TEST_EMAIL_PREFIX = "e2e-";
export const uniqueEmail = () => `${TEST_EMAIL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}@university.edu`;

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("University email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/(student|instructor)\/courses/);
}

/** Registers a brand-new student, so tests that change data never touch the seeded accounts. */
export async function register(page: Page, name = "E2E Tester") {
  const email = uniqueEmail();
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("University email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/student\/courses/);
  return { email, name };
}

/** The account menu exists in the sidebar (desktop) and the top bar (phones); use whichever is on screen. */
export async function signOut(page: Page, name: string) {
  await page.getByRole("button", { name: `Account menu for ${name}` }).filter({ visible: true }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/**
 * A throwaway course (code `E2E-…`, removed by deleteCourse or global-teardown) with one team of brand-new students,
 * each signed in on their own page. `page` ends up signed in as the instructor, on the course page.
 */
export async function courseWithTeam(page: Page, browser: Browser, studentNames: string[], title = "E2E course") {
  const code = `E2E-${Date.now().toString(36).toUpperCase()}`;
  const students: { page: Page; email: string; name: string }[] = [];
  for (const name of studentNames) {
    const p = await (await browser.newContext()).newPage();
    students.push({ page: p, ...(await register(p, name)) });
  }
  await signIn(page, INSTRUCTOR.email);
  await page.getByRole("button", { name: "New course" }).first().click();
  const create = page.getByRole("dialog", { name: "New course" });
  await create.getByLabel("Code").fill(code);
  await create.getByLabel("Title").fill(title);
  await create.getByRole("button", { name: "Create course" }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const courseUrl = page.url();

  await page.getByRole("button", { name: "Add students" }).first().click();
  const add = page.getByRole("dialog", { name: `Add students to ${code}` });
  await add.getByLabel("Email addresses").fill(students.map((s) => s.email).join("\n"));
  await add.getByRole("button", { name: /^Add \d+ students?$/ }).click();
  await add.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "New team" }).click();
  const team = page.getByRole("dialog", { name: `New team in ${code}` });
  await team.getByLabel("Team name").fill("E2E Team");
  await expect(team.getByRole("checkbox")).toHaveCount(students.length); // the roster loads after the dialog opens
  for (const box of await team.getByRole("checkbox").all()) await box.check();
  await team.getByRole("button", { name: "Create team" }).click();
  await expect(team).toBeHidden();
  return { code, courseUrl, students };
}

export async function deleteCourse(page: Page, code: string) {
  await page.goto("/instructor/courses");
  await page.getByRole("button", { name: `Options for ${code}` }).click();
  await page.getByRole("menuitem", { name: "Delete course" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete course" }).click();
  await expect(page.getByRole("button", { name: `Options for ${code}` })).toHaveCount(0);
}
