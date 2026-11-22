import { expect, test } from "@playwright/test";
import { adminRest, courseWithTeam, deleteCourse } from "./helpers";

// A throwaway team with some history added directly (a done task, messages, a stand-up and a peer review).
test("the contribution report shows a student's work next to the team's, with peer reviews for the instructor only", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, courseUrl, students: [uma, vic] } = await courseWithTeam(page, browser, ["E2E Uma", "E2E Vic"], "E2E contribution course");
  const [team] = await adminRest<{ id: string }[]>(`teams?select=id,courses!inner(code)&courses.code=eq.${code}`);
  const idOf = async (email: string) => (await adminRest<{ id: string }[]>(`users?select=id&email=eq.${encodeURIComponent(email)}`))[0].id;
  const [umaId, vicId] = [await idOf(uma.email), await idOf(vic.email)];

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [task] = await adminRest<{ id: string }[]>("tasks", { method: "POST", body: { team_id: team.id, title: "E2E write the schema", assignee_id: umaId, due_date: tomorrow } });
  await adminRest(`tasks?id=eq.${task.id}`, { method: "PATCH", body: { status: "done" } });
  await adminRest("tasks", { method: "POST", body: { team_id: team.id, title: "E2E draw the diagram", assignee_id: vicId } });
  await adminRest("messages", { method: "POST", body: [
    { team_id: team.id, sender_id: umaId, content: "E2E one" }, { team_id: team.id, sender_id: umaId, content: "E2E two" },
    { team_id: team.id, sender_id: umaId, content: "E2E three" }, { team_id: team.id, sender_id: vicId, content: "E2E four" },
  ] });
  await adminRest("peer_reviews", { method: "POST", body: {
    team_id: team.id, reviewer_id: vicId, reviewee_id: umaId, rating: 4, category_ratings: { communication: 5 }, feedback: "E2E: always on time",
  } });

  // The instructor opens Uma's report from the roster.
  await page.goto(courseUrl);
  await page.getByRole("link", { name: "E2E Uma: contribution report" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Uma" })).toBeVisible();
  await expect(page.getByText("100% of the team's · 1 assigned")).toBeVisible();
  await expect(page.getByText("75% of team chat")).toBeVisible();
  const tasks = page.getByRole("region", { name: "Assigned tasks" });
  await expect(tasks.getByRole("listitem").filter({ hasText: "E2E write the schema" }).getByText("Done", { exact: true })).toBeVisible();
  await expect(tasks.getByText("E2E draw the diagram")).toHaveCount(0); // Vic's
  const peer = page.getByRole("region", { name: "Peer reviews" });
  await expect(peer.getByText("of 5, from 1 review")).toBeVisible();
  await expect(peer.getByText("E2E: always on time")).toBeVisible();
  await expect(page.getByRole("img", { name: /^E2E Uma: Tasks done 100%, Messages 75%/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /: 1 tasks done, 3 messages$/ })).toBeVisible(); // this week

  // "Save as PDF" opens the browser's print dialog; printed, the report stands alone with a line saying whose it is.
  await page.evaluate(() => { (window as unknown as { printed: boolean }).printed = false; window.print = () => { (window as unknown as { printed: boolean }).printed = true; }; });
  await page.getByRole("button", { name: "Save as PDF" }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: boolean }).printed)).toBe(true);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText(/^Contribution report for E2E Uma · made on /)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeHidden();
  if (process.env.E2E_PDF) await page.pdf({ path: process.env.E2E_PDF, format: "A4", printBackground: true });
  await page.emulateMedia({ media: "screen" });

  // Uma sees her own report from the course page, without the peer reviews.
  await uma.page.goto(courseUrl.replace("/instructor/", "/student/"));
  await uma.page.getByRole("link", { name: "Your contribution" }).click();
  await expect(uma.page.getByRole("heading", { level: 1, name: "Your contribution" })).toBeVisible();
  await expect(uma.page.getByRole("region", { name: "Assigned tasks" }).getByText("E2E write the schema")).toBeVisible();
  await expect(uma.page.getByRole("region", { name: "Peer reviews" })).toHaveCount(0);
  await expect(uma.page.getByText("E2E: always on time")).toHaveCount(0);

  await deleteCourse(page, code);
});
