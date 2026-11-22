import { adminRest, INSTRUCTOR, STUDENT, serviceKey } from "./helpers";

/**
 * The tests read the seeded accounts in English. Someone using one of them in বাংলা (Profile → Language) would make
 * every such test fail on a missing English label, so stop early and say why instead. Never changes the accounts.
 */
export default async function globalSetup() {
  if (!serviceKey()) return; // the tests report the missing database themselves
  const emails = [STUDENT.email, INSTRUCTOR.email].map(encodeURIComponent).join(",");
  const rows = await adminRest<{ email: string; locale: string }[]>(`users?select=email,locale&email=in.(${emails})&locale=neq.en`);
  if (rows.length) {
    throw new Error(`Seeded account(s) set to a language other than English: ${rows.map((r) => `${r.email} (${r.locale})`).join(", ")}. `
      + "Switch them back in Profile → Language (and close browsers still signed in to them), then run the tests again.");
  }
}
