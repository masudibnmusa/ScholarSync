import { expect, test } from "@playwright/test";
import { adminRest, courseWithTeam, deleteCourse } from "./helpers";

// No calls to GitHub here: the repo and its activity are added directly, as the sync job would (the sync itself was
// checked against a real public repo; see "GitHub per team" in the README). Linking a malformed name never leaves the app.
test("a team's GitHub commits are matched to students and count in their contribution", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, courseUrl, students: [hal, ida] } = await courseWithTeam(page, browser, ["E2E Hal", "E2E Ida"], "E2E github course");
  const [team] = await adminRest<{ id: string }[]>(`teams?select=id,courses!inner(code)&courses.code=eq.${code}`);
  const [halUser] = await adminRest<{ id: string }[]>(`users?select=id&email=eq.${encodeURIComponent(hal.email)}`);

  // Hal adds his GitHub username; a malformed one is caught first.
  await hal.page.goto("/student/profile");
  const username = hal.page.getByLabel("GitHub username");
  await username.fill("bad_name!");
  await expect(hal.page.getByText("Letters, numbers and single hyphens, up to 39 characters.")).toBeVisible();
  await username.fill("@e2e-hal-dev");
  await hal.page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(hal.page.getByText("Profile saved")).toBeVisible();

  // Something that isn't a repository is refused before anything is sent to GitHub.
  await hal.page.goto("/student");
  await hal.page.getByRole("button", { name: "GitHub repository" }).click();
  const dialog = hal.page.getByRole("dialog", { name: "E2E Team's repository" });
  await dialog.getByLabel("GitHub repository").fill("not a repo");
  await dialog.getByRole("button", { name: "Link repository" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Use owner/name, or paste the repository's GitHub link.");

  // The sync job's result: two commits by Hal (GitHub's spelling differs in case), one by a stranger, a merged PR.
  const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  await adminRest(`teams?id=eq.${team.id}`, { method: "PATCH", body: { repo: "e2e-org/e2e-project", repo_synced_at: at(0) } });
  await adminRest("repo_activity", { method: "POST", body: [
    { team_id: team.id, id: "a1b2c3d4e5f6", kind: "commit", github_login: "E2E-Hal-Dev", author_name: "Hal", title: "E2E add the login form", url: "https://github.com/e2e-org/e2e-project/commit/a1b2c3d4e5f6", state: null, at: at(5) },
    { team_id: team.id, id: "b2c3d4e5f6a1", kind: "commit", github_login: "e2e-hal-dev", author_name: "Hal", title: "E2E fix the build", url: "https://github.com/e2e-org/e2e-project/commit/b2c3d4e5f6a1", state: null, at: at(4) },
    { team_id: team.id, id: "c3d4e5f6a1b2", kind: "commit", github_login: "someone-else", author_name: "Someone", title: "E2E tweak the readme", url: "https://github.com/e2e-org/e2e-project/commit/c3d4e5f6a1b2", state: null, at: at(3) },
    { team_id: team.id, id: "pr-7", kind: "pr", github_login: "e2e-hal-dev", author_name: "e2e-hal-dev", title: "E2E login page", url: "https://github.com/e2e-org/e2e-project/pull/7", state: "merged", at: at(2) },
  ] });

  // The open dialog follows live.
  await expect(dialog.getByRole("link", { name: /e2e-org\/e2e-project/ })).toHaveAttribute("href", "https://github.com/e2e-org/e2e-project");
  const members = dialog.getByRole("region", { name: "Commits by member" });
  await expect(members.getByRole("listitem").filter({ hasText: "E2E Hal" })).toContainText("@e2e-hal-dev2");
  await expect(members.getByRole("listitem").filter({ hasText: "E2E Ida" })).toContainText("No GitHub username0");
  const activity = dialog.getByRole("region", { name: "Latest activity" });
  await expect(activity.getByRole("link", { name: /E2E add the login form a1b2c3d · E2E Hal/ })).toHaveAttribute("href", /\/commit\/a1b2c3d4e5f6$/);
  await expect(activity.getByRole("link", { name: /E2E tweak the readme c3d4e5f · @someone-else/ })).toBeVisible();
  await expect(activity.getByRole("link", { name: /E2E login page/ }).getByText("merged")).toBeVisible();

  // Hal's commits show in his contribution report.
  await page.goto(`${courseUrl}/students/${halUser.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "E2E Hal" })).toBeVisible();
  await expect(page.getByText("100% of e2e-org/e2e-project")).toBeVisible();

  // Ida, a teammate, unlinks it; the activity goes with it.
  await ida.page.goto("/student");
  await ida.page.getByRole("button", { name: "GitHub repository" }).click();
  const idaDialog = ida.page.getByRole("dialog", { name: "E2E Team's repository" });
  await idaDialog.getByRole("button", { name: "Unlink" }).click();
  await ida.page.getByRole("alertdialog").getByRole("button", { name: "Unlink" }).click();
  await expect(idaDialog.getByLabel("GitHub repository")).toBeVisible();
  expect(await adminRest(`repo_activity?select=id&team_id=eq.${team.id}`)).toEqual([]);

  await deleteCourse(page, code);
});
