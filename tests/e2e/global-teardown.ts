import { execSync } from "node:child_process";
import { TEST_EMAIL_PREFIX } from "./helpers";

/** Deletes the accounts the tests registered (and, by cascade, their rows). Uses the local service role key. */
export default async function globalTeardown() {
  let key: string | undefined;
  try {
    key = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .match(/^SERVICE_ROLE_KEY="?([^"\n]+)"?$/m)?.[1];
  } catch {}
  if (!key) return console.warn("e2e teardown: local Supabase not reachable; test accounts were left behind");

  const api = "http://127.0.0.1:54321/auth/v1/admin/users";
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  // Courses a failed courses.spec left behind (codes start with E2E-). Their teams, tasks and enrollments go with them.
  await fetch("http://127.0.0.1:54321/rest/v1/courses?code=like.E2E-*", { method: "DELETE", headers });
  const { users } = (await (await fetch(`${api}?per_page=1000`, { headers })).json()) as { users: { id: string; email?: string }[] };
  const mine = users.filter((u) => u.email?.startsWith(TEST_EMAIL_PREFIX));
  await Promise.all(mine.map((u) => fetch(`${api}/${u.id}`, { method: "DELETE", headers })));
}
