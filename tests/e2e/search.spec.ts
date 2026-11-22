import { expect, test, type Page } from "@playwright/test";
import { adminRest, courseWithTeam, deleteCourse, register } from "./helpers";

async function search(page: Page, text: string) {
  await page.keyboard.press("Control+k");
  const menu = page.getByRole("dialog");
  await menu.getByRole("combobox").fill(text);
  return menu;
}

// A throwaway team with a task and a message added directly; a student outside the team must not find them.
test("the command menu finds tasks and messages in my teams only, and opens them", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const word = `zebra${Date.now().toString(36)}`; // unique, so other data never matches
  const { code, students: [sam] } = await courseWithTeam(page, browser, ["E2E Sam"], "E2E search course");
  const [team] = await adminRest<{ id: string }[]>(`teams?select=id,courses!inner(code)&courses.code=eq.${code}`);
  const [{ id: samId }] = await adminRest<{ id: string }[]>(`users?select=id&email=eq.${encodeURIComponent(sam.email)}`);
  await adminRest("tasks", { method: "POST", body: { team_id: team.id, title: `E2E plan the ${word} demo`, assignee_id: samId } });
  await adminRest("messages", { method: "POST", body: { team_id: team.id, sender_id: samId, content: `notes for the ${word} demo` } });

  // Sam finds both, grouped, and opening the task shows it on the board.
  await sam.page.goto("/student/week");
  let menu = await search(sam.page, word);
  await expect(menu.getByRole("group", { name: "Tasks" }).getByRole("option", { name: new RegExp(`E2E plan the ${word} demo`) })).toBeVisible();
  await expect(menu.getByRole("group", { name: "Messages" }).getByRole("option", { name: new RegExp(`notes for the ${word} demo.*E2E Team · E2E Sam`) })).toBeVisible();
  await menu.getByRole("option", { name: new RegExp(`E2E plan the ${word} demo`) }).click();
  await expect(sam.page).toHaveURL(new RegExp(`/student\\?team=${team.id}&task=`));
  await expect(sam.page.getByRole("dialog").getByLabel("Title")).toHaveValue(`E2E plan the ${word} demo`);

  // The instructor finds it too.
  menu = await search(page, word);
  await expect(menu.getByRole("option", { name: new RegExp(`E2E plan the ${word} demo`) })).toBeVisible();
  await page.keyboard.press("Escape");

  // A student in no team finds nothing.
  const outsider = await (await browser.newContext()).newPage();
  await register(outsider, "E2E Outsider");
  menu = await search(outsider, word);
  await expect(menu.getByText("Nothing matches that search.")).toBeVisible();
  await expect(menu.getByRole("option", { name: new RegExp(word) })).toHaveCount(0);

  await deleteCourse(page, code);
});
