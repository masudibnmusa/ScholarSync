import path from "node:path";
import { expect, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

// A throwaway course with two new students; nothing here touches the seed accounts.
test("team changes, profile photos and announcements show up live, without a reload", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, courseUrl, students: [lia, max] } = await courseWithTeam(page, browser, ["E2E Lia", "E2E Max"], "E2E live course");

  await lia.page.goto("/student");
  await expect(lia.page.getByRole("heading", { name: "E2E Team workspace" })).toBeAttached();
  const members = lia.page.getByRole("img", { name: /^Members:/ }).filter({ visible: true }).first();
  await expect(members.locator("img")).toHaveCount(0); // initials only

  // The instructor renames the team; Lia's workspace follows.
  await page.getByRole("button", { name: "Edit team" }).click();
  const edit = page.getByRole("dialog", { name: "Edit E2E Team" });
  await edit.getByLabel("Team name").fill("E2E Renamed");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toBeHidden();
  await expect(lia.page.getByRole("heading", { name: "E2E Renamed workspace" })).toBeAttached();

  // Max adds a profile photo; it appears in Lia's member list.
  await max.page.goto("/student/profile");
  await max.page.locator("input[type=file][accept*='image/png']").setInputFiles(path.join(__dirname, "fixtures/photo.png"));
  await max.page.getByRole("dialog", { name: "Crop your photo" }).getByRole("button", { name: "Save photo" }).click();
  await expect(max.page.getByText("Photo updated")).toBeVisible();
  await expect(members.locator("img")).toHaveCount(1);

  // The instructor posts an announcement; it appears on Lia's open course page.
  await lia.page.goto(courseUrl.replace("/instructor/", "/student/"));
  await expect(lia.page.getByRole("heading", { level: 1, name: "E2E live course" })).toBeVisible();
  await page.getByLabel("Announcement title").fill("E2E: lab moved to room 402");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(lia.page.getByText("E2E: lab moved to room 402")).toBeVisible();

  await deleteCourse(page, code);
});
