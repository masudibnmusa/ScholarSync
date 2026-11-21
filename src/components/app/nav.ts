import { Bell, CalendarDots, ChartLineUp, Lifebuoy, SquaresFour, Kanban, Sparkle, Star, UserCircle, Warning } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

export type NavItem = { href: string; label: string; short?: string; icon: Icon; badge?: "notifications" | "conflicts" | "suggestions"; secondary?: boolean };

// The workspace (board + chat + files for a team) is home for both roles; everything else is a side trip.
// `secondary` items sit behind "More" in the mobile tab bar (max five tabs). `short` is the tab-bar label.
export const studentNav: NavItem[] = [
  { href: "/student/courses", label: "Dashboard", icon: SquaresFour },
  { href: "/student", label: "Workspace", icon: Kanban, badge: "suggestions" },
  { href: "/student/week", label: "My week", short: "Week", icon: CalendarDots },
  { href: "/student/peer-review", label: "Peer review", short: "Reviews", icon: Star },
  { href: "/student/notifications", label: "Notifications", short: "Inbox", icon: Bell, badge: "notifications", secondary: true },
  { href: "/student/profile", label: "Profile", icon: UserCircle, secondary: true },
];

export const instructorNav: NavItem[] = [
  { href: "/instructor/courses", label: "Dashboard", icon: SquaresFour },
  { href: "/instructor", label: "Workspace", icon: Kanban },
  { href: "/instructor/analytics", label: "Analytics", icon: ChartLineUp },
  { href: "/instructor/conflicts", label: "Conflicts", icon: Warning, badge: "conflicts" },
  { href: "/instructor/at-risk", label: "At risk", icon: Lifebuoy, secondary: true },
  { href: "/instructor/matching", label: "AI matching", short: "Matching", icon: Sparkle, secondary: true },
  { href: "/instructor/notifications", label: "Notifications", icon: Bell, badge: "notifications", secondary: true },
  { href: "/instructor/profile", label: "Profile", icon: UserCircle, secondary: true },
];

export const SIDEBAR_COOKIE = "sidebar-collapsed";

export const navFor = (role: string) => (role === "instructor" ? instructorNav : studentNav);
export const homeFor = (role: string) => (role === "instructor" ? "/instructor" : "/student");

export function isActive(pathname: string, href: string) {
  return href === "/student" || href === "/instructor" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

// Notification types (set by database triggers) → where each one leads. A trigger can store an exact
// in-app route in `link` (e.g. an instructor's reply notification opens that team's chat).
export function notificationHref(type: string, role: string, link?: string | null) {
  if (link?.startsWith(role === "instructor" ? "/instructor" : "/student")) return link;
  if (role === "instructor") return type === "conflict" ? "/instructor/conflicts" : "/instructor";
  if (type === "message") return "/student?view=chat";
  if (type === "review") return "/student/peer-review";
  return "/student";
}
