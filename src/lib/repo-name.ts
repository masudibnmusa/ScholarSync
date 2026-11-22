// No imports: shared by the server and its unit test (node src/lib/repo-name.check.mjs).

const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/; // same rule as the teams.repo check

/** "owner/name" from what people paste: owner/name, a github.com URL (with .git or a sub-page) or an SSH remote. */
export function parseRepo(input: string): string | null {
  const s = input.trim()
    .replace(/^git@github\.com:/i, "")
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/[?#].*$/, "");
  const [owner, name] = s.split("/");
  const repo = owner && name ? `${owner}/${name}` : "";
  return REPO_RE.test(repo) ? repo : null;
}

