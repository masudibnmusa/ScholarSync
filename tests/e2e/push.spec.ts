import { expect, test } from "@playwright/test";
import { register } from "./helpers";

// The default headless shell always reports notifications as denied; full Chromium (new headless mode) honours the grant.
test.use({ channel: "chromium" });

test("the app is installable: manifest, icons and service worker", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "ScholarSync", display: "standalone", start_url: "/student/courses" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);

  await register(page, "E2E Install Tester");
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe("/");
});

// Fresh account, so no real user's devices are touched. Test browsers have no push service (Chromium answers
// "Registration failed"), so the browser's PushManager is replaced with a fake that hands out an https endpoint;
// everything from the card to the saved subscription on the server is real.
test("a user turns alerts on and off for this device", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["notifications"], { origin: new URL(baseURL!).origin });
  await context.addInitScript(() => {
    const KEY = "e2e-push-sub";
    const make = (endpoint: string) => ({
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }),
      unsubscribe: async () => { localStorage.removeItem(KEY); return true; },
    });
    PushManager.prototype.subscribe = async function () {
      const endpoint = `https://push.e2e.invalid/${crypto.randomUUID()}`;
      localStorage.setItem(KEY, endpoint);
      return make(endpoint) as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function () {
      const endpoint = localStorage.getItem(KEY);
      return (endpoint ? make(endpoint) : null) as unknown as PushSubscription;
    };
  });
  await register(page, "E2E Alerts Tester");
  await page.goto("/student/profile");
  const toggle = page.getByRole("switch", { name: "Alerts on this device" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await toggle.click();
  await expect(page.getByText("Alerts are on", { exact: true })).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "true"); // the browser still holds the subscription

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(async () => !!(await (await navigator.serviceWorker.ready).pushManager.getSubscription()))).toBe(false);
});
