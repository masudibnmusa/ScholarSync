import path from "node:path";
import { expect, test } from "@playwright/test";
import { register } from "./helpers";

// Uses a freshly registered account so a real user's photo is never replaced or deleted.
test("a user crops, saves, replaces and removes their profile photo", async ({ page }) => {
  await register(page, "E2E Photo Tester");
  await page.goto("/student/profile");
  const hero = page.locator("section[aria-labelledby=profile-title]");
  const photo = hero.locator("img");
  await expect(photo).toHaveCount(0); // initials to start with

  // Picking a file opens the crop dialog; nothing is saved yet.
  await page.locator("input[type=file][accept*='image/png']").setInputFiles(path.join(__dirname, "fixtures/photo.png"));
  const dialog = page.getByRole("dialog", { name: "Crop your photo" });
  await expect(dialog).toBeVisible();
  await expect(photo).toHaveCount(0);

  // Zoom with the keyboard and drag the picture.
  const slider = dialog.getByRole("slider", { name: "Zoom" });
  await slider.focus();
  for (let i = 0; i < 50; i++) await page.keyboard.press("ArrowRight");
  await expect(slider).not.toHaveAttribute("aria-valuenow", "1");
  const box = (await dialog.getByRole("group").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();

  await dialog.getByRole("button", { name: "Save photo" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Photo updated")).toBeVisible();
  await expect(photo).toHaveCount(1);
  const first = await photo.getAttribute("src");
  expect(await photo.evaluate((img: HTMLImageElement) => `${img.naturalWidth}x${img.naturalHeight}`)).toBe("512x512");

  // Cancelling a new pick keeps the current photo.
  await page.getByRole("button", { name: "Change profile photo" }).click();
  await page.getByRole("menuitem", { name: "Upload new photo" }).click();
  await page.locator("input[type=file][accept*='image/png']").setInputFiles(path.join(__dirname, "fixtures/photo.png"));
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(photo).toHaveAttribute("src", first!);

  // Replacing gives a new file.
  await page.locator("input[type=file][accept*='image/png']").setInputFiles(path.join(__dirname, "fixtures/photo.png"));
  await dialog.getByRole("button", { name: "Save photo" }).click();
  await expect(dialog).toBeHidden();
  await expect(photo).not.toHaveAttribute("src", first!);

  // The photo also shows in the sidebar's account card.
  await expect(page.locator("aside", { has: page.getByRole("navigation", { name: "Main" }) }).locator("img")).toHaveCount(1);

  // Removing goes back to initials.
  await page.getByRole("button", { name: "Change profile photo" }).click();
  await page.getByRole("menuitem", { name: "Remove photo" }).click();
  await expect(page.getByText("Photo removed")).toBeVisible();
  await expect(photo).toHaveCount(0);
});

test("a file that isn't an image is refused", async ({ page }) => {
  await register(page, "E2E Wrong File");
  await page.goto("/student/profile");
  await page.locator("input[type=file][accept*='image/png']").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText("Use a PNG, JPG, WebP or GIF image")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Crop your photo" })).toBeHidden();
});
