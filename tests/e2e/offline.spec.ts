import { expect, test, type Page } from "@playwright/test";
import { courseWithTeam, deleteCourse, signOut } from "./helpers";

async function openChat(page: Page) {
  await page.getByRole("button", { name: /^Open team chat and files/ }).click();
  return page.getByRole("dialog", { name: "team chat and files" });
}

// Two new students on a throwaway team. Playwright's offline switch cuts the page and its service worker off the network.
test("the app opens offline with the last data, and queued messages send on reconnect", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, students: [oli, pia] } = await courseWithTeam(page, browser, ["E2E Oli", "E2E Pia"], "E2E offline course");

  // Pia says something while Oli is online.
  await pia.page.goto("/student");
  const piaChat = await openChat(pia.page);
  await piaChat.getByLabel("Message E2E Team").fill("Online hello from Pia");
  await piaChat.getByLabel("Message E2E Team").press("Enter");

  // Oli opens the workspace, chat and My week once, with the service worker in control.
  await oli.page.goto("/student");
  await oli.page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await oli.page.reload();
  let chat = await openChat(oli.page);
  await expect(chat.getByRole("log").getByText("Online hello from Pia")).toBeVisible();
  await oli.page.goto("/student/week");
  await expect(oli.page.getByRole("heading", { level: 1, name: "My week" })).toBeVisible();

  // Offline: the workspace and chat still open with what Oli saw.
  await oli.page.context().setOffline(true);
  await oli.page.goto("/student");
  await expect(oli.page.getByText("You're offline.")).toBeVisible();
  await expect(oli.page.getByRole("heading", { name: "E2E Team workspace" })).toBeAttached();
  chat = await openChat(oli.page);
  await expect(chat.getByRole("log").getByText("Online hello from Pia")).toBeVisible();

  // A message typed offline waits in the outbox.
  await chat.getByLabel("Message E2E Team").fill("Written on the train");
  await chat.getByLabel("Message E2E Team").press("Enter");
  const queued = chat.getByRole("log").locator("li", { hasText: "Written on the train" });
  await expect(queued.getByText("Waiting to send")).toBeVisible();

  // My week opens from the last copy; a page never opened on this device says so.
  await oli.page.goto("/student/week");
  await expect(oli.page.getByRole("heading", { level: 1, name: "My week" })).toBeVisible();
  await oli.page.goto("/student/peer-review");
  await expect(oli.page.getByRole("heading", { name: "You're offline" })).toBeVisible();

  // Back online: the queued message goes out, and Pia sees it live.
  await oli.page.goto("/student/week");
  await expect(oli.page.getByRole("heading", { level: 1, name: "My week" })).toBeVisible();
  await oli.page.context().setOffline(false);
  await expect(oli.page.getByText("Messages you wrote offline were sent")).toBeVisible();
  await expect(piaChat.getByRole("log").getByText("Written on the train")).toBeVisible();
  await expect(oli.page.getByText("You're offline.")).toBeHidden();

  // Signing out forgets every offline copy on the device.
  await signOut(oli.page, "E2E Oli");
  // (Scripts for the sign-in page may be cached again right away; they hold no one's data.)
  const left = await oli.page.evaluate(async () => {
    const pages: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) if (/^\/(student|instructor)/.test(new URL(req.url).pathname)) pages.push(req.url);
    }
    return { pages, keys: Object.keys(localStorage).filter((k) => k.startsWith("ss-offline:") || k.startsWith("ss-outbox:")) };
  });
  expect(left).toEqual({ pages: [], keys: [] });

  await deleteCourse(page, code);
});
