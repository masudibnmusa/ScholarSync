import { expect, type Page } from "@playwright/test";

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
