import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/session";
import { AppShell } from "@/components/app/app-shell";

// Sign-in gate for the whole app. Data access is enforced separately by Postgres RLS in every Server Action.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionProfile();
  if (!user) redirect("/login");
  return <AppShell user={user}>{children}</AppShell>;
}
