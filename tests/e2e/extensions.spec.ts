import { expect, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const shortDay = (offset: number) => new Date(`${isoDay(offset)}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

// A throwaway course with one team of one new student; deleted at the end (and by global-teardown on failure).
test("a team asks for more time and the instructor approves it, live on both sides", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, courseUrl, students: [ada] } = await courseWithTeam(page, browser, ["E2E Ada"], "E2E extension course");

  await page.getByRole("button", { name: "Add milestone" }).click();
  const ms = page.getByRole("dialog", { name: "New milestone" });
  await ms.getByLabel("Title").fill("Proposal");
  await ms.getByLabel("Due date").fill(isoDay(2));
  await ms.getByRole("button", { name: "Add milestone" }).click();
  await expect(ms).toBeHidden();

  // Student: a date that isn't later is refused, then the request goes in and waits.
  await ada.page.goto(courseUrl.replace("/instructor/", "/student/"));
  await ada.page.getByRole("button", { name: "Ask for more time" }).click();
  const ask = ada.page.getByRole("dialog", { name: "Ask for more time: Proposal" });
  await ask.getByLabel("New due date").fill(isoDay(2));
  await ask.getByLabel("Why the team needs it").fill("Our user tests moved to next week.");
  await ask.getByRole("button", { name: "Send request" }).click();
  await expect(ask.getByText("Pick a date after the current due date.")).toBeVisible();
  await ask.getByLabel("New due date").fill(isoDay(9));
  await ask.getByRole("button", { name: "Send request" }).click();
  await expect(ask).toBeHidden();
  await expect(ada.page.getByText(`Asked for more time, until ${shortDay(9)}. Waiting for your instructor.`)).toBeVisible();
  await expect(ada.page.getByRole("button", { name: "Ask for more time" })).toHaveCount(0);

  // Instructor: the request shows up live, with the reason; approving it.
  const request = page.getByLabel("Request for more time from E2E Team");
  await expect(request.getByText(`E2E Team asks for more time, until ${shortDay(9)}`)).toBeVisible();
  await expect(request.getByText("Our user tests moved to next week.")).toBeVisible();
  await request.getByRole("button", { name: "Approve" }).click();
  await expect(request).toBeHidden();
  await expect(page.getByText(`More time: E2E Team (${shortDay(9)})`)).toBeVisible();

  // Student: the new date shows live, and the team was notified.
  await expect(ada.page.getByText(`Extended from ${shortDay(2)} to ${shortDay(9)}.`)).toBeVisible();
  await ada.page.goto("/student/notifications");
  await expect(ada.page.getByText(/More time on Proposal: due/)).toBeVisible();

  await deleteCourse(page, code);
});
