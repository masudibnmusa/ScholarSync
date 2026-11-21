import { expect, test } from "@playwright/test";
import { INSTRUCTOR, STUDENT, register, signIn, signOut } from "./helpers";

test.describe("Signing in and access control", () => {
  test("a signed-out visitor is sent to the sign-in page", async ({ page }) => {
    await page.goto("/student/week");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  });

  test("a wrong password shows an error and stays signed out", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("University email").fill(STUDENT.email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("That email and password don't match")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("empty fields are flagged before anything is sent", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel("University email")).toHaveAttribute("aria-invalid", "true");
  });

  test("a student lands on their dashboard and can sign out", async ({ page }) => {
    await signIn(page, STUDENT.email);
    await expect(page).toHaveURL(/\/student\/courses/);
    await signOut(page, STUDENT.name);
    await page.goto("/student");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a student can't open instructor pages", async ({ page }) => {
    await signIn(page, STUDENT.email);
    await page.goto("/instructor/analytics");
    await expect(page).toHaveURL(/\/student/);
  });

  test("an instructor lands on their dashboard and can't open student pages", async ({ page }) => {
    await signIn(page, INSTRUCTOR.email);
    await expect(page).toHaveURL(/\/instructor\/courses/);
    await page.goto("/student/week");
    await expect(page).toHaveURL(/\/instructor/);
  });

  test("a signed-in user visiting /login goes straight home", async ({ page }) => {
    await signIn(page, STUDENT.email);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/student\/courses/);
  });

  test("a new account is created as a student and signed in", async ({ page }) => {
    const me = await register(page, "E2E New Student");
    await page.goto("/student/profile");
    await expect(page.getByRole("heading", { name: me.name })).toBeVisible();
    await expect(page.getByText(me.email)).toBeVisible();
    await expect(page.getByText("student", { exact: true })).toBeVisible();
  });
});
