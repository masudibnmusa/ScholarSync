import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { countAtRisk, getAvatars, getConflicts, getNotifications, getTeams } from "@/app/actions";
import { getSessionProfile } from "@/lib/session";
import { AppStoreSnapshot, type InitialData } from "@/lib/store";
import { AppShell } from "@/components/app/app-shell";
import { SIDEBAR_COOKIE } from "@/components/app/nav";

/** A part that fails to load is left out: the browser loads it again and shows the usual error toast. */
const orSkip = <T,>(p: Promise<T>) => p.catch((err) => { console.error("First load on the server failed:", err); return undefined; });

// Sign-in gate for the whole app. Data access is enforced separately by Postgres RLS in every Server Action.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionProfile();
  if (!user) redirect("/login");
  const instructor = user.role === "instructor";
  // The data every page shares (teams, notifications, photos, alerts), so pages render with it instead of a skeleton.
  const [teams, notifications, avatarPaths, conflictAlerts, atRiskCount] = await Promise.all([
    orSkip(getTeams()), orSkip(getNotifications()), orSkip(getAvatars()),
    instructor ? orSkip(getConflicts()) : undefined, instructor ? orSkip(countAtRisk()) : undefined,
  ]);
  const data: InitialData = { teams, notifications, avatarPaths, conflictAlerts, atRiskCount };
  // Read on the server so the sidebar renders in the right mode from the first paint. Auto-hide unless pinned open ("0").
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value !== "0";
  return (
    <AppStoreSnapshot user={user} data={data}>
      <AppShell user={user} sidebarCollapsed={collapsed}>{children}</AppShell>
    </AppStoreSnapshot>
  );
}
