import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/session";
import { AppShell } from "@/components/app/app-shell";
import { SIDEBAR_COOKIE } from "@/components/app/nav";

// Sign-in gate for the whole app. Data access is enforced separately by Postgres RLS in every Server Action.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionProfile();
  if (!user) redirect("/login");
  // Read on the server so a collapsed sidebar renders collapsed from the first paint.
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  return <AppShell user={user} sidebarCollapsed={collapsed}>{children}</AppShell>;
}
