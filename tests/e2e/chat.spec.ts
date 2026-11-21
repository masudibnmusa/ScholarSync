import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

async function openChat(page: Page) {
  await page.goto("/student");
  await page.getByRole("button", { name: /^Open team chat and files/ }).click();
  return page.getByRole("dialog", { name: "team chat and files" });
}

// Two new students on a throwaway team, so nobody real gets the chat notifications.
test("teammates reply, react and search in team chat, live", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, students: [ada, ben] } = await courseWithTeam(page, browser, ["E2E Ada", "E2E Ben"]);

  const adaChat = await openChat(ada.page);
  const benChat = await openChat(ben.page);
  const adaLog = adaChat.getByRole("log");
  const benLog = benChat.getByRole("log");

  // Ada asks; Ben sees it live and replies to it.
  await adaChat.getByLabel("Message E2E Team").fill("Kickoff: who takes the database schema?");
  await adaChat.getByLabel("Message E2E Team").press("Enter");
  await expect(benLog.getByText("Kickoff: who takes the database schema?")).toBeVisible();
  // The original question is the first bubble with this text; later replies quote it too.
  const question = benLog.locator("li", { hasText: "Kickoff: who takes the database schema?" }).first();
  await question.hover();
  await question.getByRole("button", { name: "Reply to E2E Ada" }).click();
  await expect(benChat.getByText("Replying to E2E Ada")).toBeVisible();
  await benChat.getByLabel("Message E2E Team").fill("I'll take the database, done by Friday");
  await benChat.getByLabel("Message E2E Team").press("Enter");
  await expect(benChat.getByText("Replying to E2E Ada")).toBeHidden();

  // Ada sees the reply with the quote of her question, live.
  const answer = adaLog.locator("li", { hasText: "I'll take the database, done by Friday" }).last();
  await expect(answer).toBeVisible();
  await expect(answer.getByRole("button", { name: /^Replying to E2E Ada: Kickoff/ })).toBeVisible();

  // Ben reacts 👍 to the question; Ada sees it live, adds hers, then takes it back.
  await question.hover();
  await question.getByRole("button", { name: "Add a reaction" }).click();
  await ben.page.getByRole("menuitem", { name: "React with 👍" }).click();
  const adaQuestion = adaLog.locator("li", { hasText: "Kickoff: who takes the database schema?" }).first();
  const thumbs = adaQuestion.getByRole("button", { name: /^👍 \d/ });
  await expect(thumbs).toHaveAccessibleName(/^👍 1: E2E Ben$/);
  await thumbs.click();
  await expect(thumbs).toHaveAccessibleName(/^👍 2: E2E Ben, E2E Ada/);
  await expect(thumbs).toHaveAttribute("aria-pressed", "true");
  await thumbs.click();
  await expect(thumbs).toHaveAccessibleName(/^👍 1: E2E Ben$/);

  // Ada shares a file, then searches: messages and the file both turn up; a message hit jumps to it.
  await adaChat.locator("input[type=file]").setInputFiles(path.join(__dirname, "fixtures/photo.png"));
  await adaChat.getByLabel("Message E2E Team").fill("Schema sketch attached");
  await adaChat.getByLabel("Message E2E Team").press("Enter");
  await expect(adaLog.getByText("Schema sketch attached")).toBeVisible();

  await adaChat.getByRole("button", { name: "Search messages and files" }).click();
  await adaChat.getByLabel("Search messages and files in E2E Team").fill("database");
  const results = adaChat.getByRole("region", { name: "Search results" });
  await expect(results.getByRole("button")).toHaveCount(2);
  await adaChat.getByLabel("Search messages and files in E2E Team").fill("photo");
  await expect(results.getByRole("button", { name: /photo\.png/ })).toBeVisible();
  await adaChat.getByLabel("Search messages and files in E2E Team").fill("by friday");
  await results.getByRole("button", { name: /done by Friday/i }).click();
  await expect(results).toBeHidden();
  await expect(answer).toHaveClass(/bg-warm/); // highlighted after the jump
  await adaChat.getByRole("button", { name: "Search messages and files" }).click();
  await adaChat.getByLabel("Search messages and files in E2E Team").fill("zzqx nothing");
  await expect(results.getByText("Nothing matches")).toBeVisible();

  await deleteCourse(page, code);
});
