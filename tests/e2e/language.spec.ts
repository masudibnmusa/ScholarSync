import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, register, signIn, uniqueEmail } from "./helpers";

// Switching the language saves it to the account, so this uses a freshly registered student, never a seed account.

/** Fails the test on hydration errors: the server and the browser must render the same language. */
function watchHydration(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /hydrat/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => { if (/hydrat/i.test(e.message)) errors.push(e.message); });
  return errors;
}

test("a student switches to Bangla, it follows them to a new browser, and they switch back", async ({ page, browser }) => {
  const errors = watchHydration(page);
  const me = await register(page, "E2E Language Tester");
  await page.goto("/student/profile");
  await page.getByRole("radiogroup", { name: "Language" }).getByRole("radio", { name: "বাংলা" }).click();

  // The page reloads in Bangla: the document language, navigation, headings and the tab title.
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  const nav = page.getByRole("navigation", { name: "প্রধান" }).filter({ visible: true }).first();
  await expect(nav.getByRole("link", { name: "আমার সপ্তাহ" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "ড্যাশবোর্ড" })).toBeVisible();
  await expect(page.getByText("ভাষা", { exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/প্রোফাইল/);
  // Numbers shown on their own use Bangla digits too (profile strength, e.g. "১/৩").
  await expect(page.getByText(/^[০-৩]\/৩$/)).toBeVisible();

  // Other pages too, including text built from numbers and dates.
  await page.goto("/student/courses");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/সুপ্রভাত|শুভ অপরাহ্ন|শুভ সন্ধ্যা|আবার স্বাগতম/);
  await page.goto("/student/week");
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.getByRole("heading", { level: 1, name: "আমার সপ্তাহ" })).toBeVisible();
  expect(errors).toEqual([]);

  // A browser that has never seen this person signs in and switches to their saved language.
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await fresh.goto("/login");
  await expect(fresh.locator("html")).toHaveAttribute("lang", "en");
  await fresh.getByLabel("University email").fill(me.email);
  await fresh.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await fresh.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(fresh.locator("html")).toHaveAttribute("lang", "bn");
  await expect(fresh.getByRole("navigation", { name: "প্রধান" }).filter({ visible: true }).first().getByRole("link", { name: "ড্যাশবোর্ড" })).toBeVisible();
  await other.close();

  // Back to English.
  await page.goto("/student/profile");
  await page.getByRole("radiogroup", { name: "ভাষা" }).getByRole("radio", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).first().getByRole("link", { name: "My week" })).toBeVisible();
});

test("a visitor picks Bangla on the sign-in page", async ({ page }) => {
  const errors = watchHydration(page);
  await page.goto("/login");
  await page.getByRole("radiogroup", { name: "Language" }).getByRole("radio", { name: "বাংলা" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.getByRole("button", { name: "সাইন ইন", exact: true })).toBeVisible();
  await expect(page.getByLabel("বিশ্ববিদ্যালয়ের ইমেইল")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("সত্যিই কাজ করে");
  expect(errors).toEqual([]);
  // The cookie belongs to this test's browser only; put it back for nobody else to inherit.
  await page.context().clearCookies({ name: "lang" });
});

test("a browser with an old language cookie follows the account instead of overwriting it", async ({ page, browser }) => {
  const me = await register(page, "E2E Language Follower");
  // A second browser that chose English earlier (its cookie says en) and is signed in to the same account.
  const other = await browser.newContext();
  await other.addCookies([{ name: "lang", value: "en", url: "http://localhost:3000" }]);
  const laptop = await other.newPage();
  await signIn(laptop, me.email);

  // The account switches to Bangla in the first browser…
  await page.goto("/student/profile");
  await page.getByRole("radiogroup", { name: "Language" }).getByRole("radio", { name: "বাংলা" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");

  // …and the second one follows on its next page load, rather than saving its English back to the account.
  await laptop.reload();
  await expect(laptop.locator("html")).toHaveAttribute("lang", "bn");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await other.close();
});

test("a language picked on the sign-up page is saved to the new account", async ({ page, browser }) => {
  await page.goto("/register");
  await page.getByRole("radiogroup", { name: "Language" }).getByRole("radio", { name: "বাংলা" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  const email = uniqueEmail();
  await page.getByLabel("পুরো নাম").fill("E2E Bangla Signup");
  await page.getByLabel("বিশ্ববিদ্যালয়ের ইমেইল").fill(email);
  await page.getByLabel("পাসওয়ার্ড", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "অ্যাকাউন্ট তৈরি করুন" }).click();
  await page.waitForURL(/\/student\/courses/);
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");

  // A browser that has never been used signs in and gets Bangla from the account.
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await signIn(fresh, email); // signs in on the English page; the app then switches to the account's language
  await expect(fresh.locator("html")).toHaveAttribute("lang", "bn");
  await other.close();
});
