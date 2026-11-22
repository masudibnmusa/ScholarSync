import { expect, test, type Page } from "@playwright/test";
import { INSTRUCTOR, signIn, STUDENT } from "./helpers";

// Runs in the "phone" project (390 × 844, touch). Read only: the seed accounts look at pages and open panels.
const COURSE = "00000000-0000-4000-9000-000000000001"; // seed: CSE-3200

/** Anything wider than the screen: page scroll, or an element sticking out (outside an intentional scroller). */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const W = window.innerWidth;
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (p.tagName !== "MAIN" && /(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const out: string[] = [];
    if (document.documentElement.scrollWidth > W + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px)`);
    for (const el of document.querySelectorAll("main *, nav *, header *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.right <= W + 1 || el.closest("[aria-hidden=true]") || inScroller(el)) continue;
      out.push(`<${el.tagName.toLowerCase()}> "${(el.textContent ?? "").trim().slice(0, 40)}" ends at ${Math.round(r.right)}px`);
    }
    return out.slice(0, 5);
  });
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("h1").filter({ visible: true }).first()).toBeVisible();
  await page.waitForLoadState("networkidle").catch(() => {}); // data-driven layouts settle
}

for (const [who, email, pages] of [
  ["student", STUDENT.email, ["/student/courses", "/student", "/student/week", "/student/peer-review", "/student/notifications", "/student/profile", `/student/courses/${COURSE}`]],
  ["instructor", INSTRUCTOR.email, ["/instructor/courses", "/instructor", "/instructor/analytics", "/instructor/conflicts", "/instructor/at-risk",
    "/instructor/matching", "/instructor/notifications", "/instructor/profile", `/instructor/courses/${COURSE}`]],
] as const) {
  test(`every ${who} page fits a phone screen`, async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, email);
    for (const path of pages) {
      await visit(page, path);
      expect(await overflow(page), path).toEqual([]);
    }
  });
}

test("the tab bar and its More sheet get a student around", async ({ page }) => {
  await signIn(page, STUDENT.email);
  const tabs = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await expect(tabs.getByRole("link")).toHaveText(["Dashboard", "Workspace", "Week", "Reviews"]);
  await tabs.getByRole("link", { name: "Week" }).click();
  await expect(page).toHaveURL(/\/student\/week$/);
  await expect(tabs.getByRole("link", { name: "Week" })).toHaveAttribute("aria-current", "page");

  await tabs.getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet.getByRole("link")).toHaveText([/Notifications/, "Profile"]);
  await sheet.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/student\/profile$/);
  await expect(sheet).toBeHidden();
});

test("the workspace buttons stay on screen and chat opens full screen", async ({ page }) => {
  await signIn(page, STUDENT.email);
  await visit(page, "/student");
  const width = page.viewportSize()!.width;
  for (const name of [/^Team charter/, /^Weekly stand-up/, /^GitHub repository$/, /^New( task)?$/]) {
    const box = (await page.getByRole("button", { name }).filter({ visible: true }).first().boundingBox())!;
    expect(box.x, String(name)).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, String(name)).toBeLessThanOrEqual(width);
  }

  await page.getByRole("button", { name: /^Open team chat and files/ }).click();
  const chat = page.getByRole("dialog", { name: "team chat and files" });
  await expect(chat.getByRole("log")).toBeVisible();
  await expect.poll(async () => Math.round((await chat.boundingBox())!.width)).toBe(width); // after the opening animation
  expect(await overflow(page)).toEqual([]);
});
