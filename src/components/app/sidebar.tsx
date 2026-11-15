"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { homeFor, isActive, navFor, type NavItem } from "@/components/app/nav";
import { Logo } from "@/components/app/page";
import { NotificationBell, UserMenu } from "@/components/app/topbar";
import { useUser } from "@/components/app/user-context";
import { Tooltip } from "@/components/ui/overlays";

export function useBadgeCounts(): Record<NonNullable<NavItem["badge"]>, number> {
  const notifications = useAppStore((s) => s.unreadNotifCount);
  const conflicts = useAppStore((s) => s.conflictAlerts.filter((c) => !c.isResolved).length);
  const suggestions = useAppStore((s) => s.taskSuggestions.length);
  return { notifications, conflicts, suggestions };
}

/** Full-width nav list, used in the mobile "More" sheet. */
export function NavLinks({ onNavigate, pillId, items }: { onNavigate?: () => void; pillId: string; items?: NavItem[] }) {
  const pathname = usePathname();
  const user = useUser();
  const counts = useBadgeCounts();
  return (
    <ul className="space-y-1">
      {(items ?? navFor(user.role)).map((item) => {
        const active = isActive(pathname, item.href);
        const count = item.badge ? counts[item.badge] : 0;
        return (
          <li key={item.href}>
            <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={cn("tap relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors", active ? "text-white" : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground")}>
              {active && <motion.span layoutId={pillId} className="absolute inset-0 rounded-xl bg-sidebar-accent" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
              <item.icon weight={active ? "fill" : "regular"} className={cn("relative size-5", active && "text-brand")} aria-hidden />
              <span className="relative flex-1">{item.label}</span>
              {count > 0 && <span className="relative flex h-5 min-w-5 items-center justify-center rounded-full bg-warm px-1.5 text-[0.6875rem] font-bold tabular-nums text-warm-foreground">{count}<span className="sr-only"> new</span></span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const railButton = "tap relative flex size-11 items-center justify-center rounded-xl transition-colors duration-200";

/** Desktop navigation: a narrow icon rail so the workspace gets the width. Notifications live in the bell at the bottom. */
export function Rail({ onSignOut }: { onSignOut: () => void }) {
  const pathname = usePathname();
  const user = useUser();
  const counts = useBadgeCounts();
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);

  return (
    <aside className="relative hidden h-dvh w-[4.5rem] shrink-0 flex-col items-center overflow-hidden bg-sidebar py-3 text-sidebar-foreground lg:flex">
      <div className="pointer-events-none absolute -left-16 -top-16 size-40 rounded-full bg-brand/25 blur-3xl" aria-hidden />
      <Link href={homeFor(user.role)} className="relative rounded-xl" aria-label="ScholarSync home"><Logo label={false} /></Link>

      <nav aria-label="Main" className="relative mt-6">
        <ul className="flex flex-col items-center gap-1.5">
          {navFor(user.role).filter((n) => !n.href.endsWith("/notifications")).map((item) => {
            const active = isActive(pathname, item.href);
            const count = item.badge ? counts[item.badge] : 0;
            return (
              <li key={item.href}>
                <Tooltip label={item.label} side="right">
                  <Link href={item.href} aria-current={active ? "page" : undefined} aria-label={count ? `${item.label}, ${count} new` : item.label}
                    className={cn(railButton, "group", active ? "text-white" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-white")}>
                    {active && <motion.span layoutId="rail-pill" className="absolute inset-0 rounded-xl bg-sidebar-accent shadow-[inset_0_0_0_1px_var(--sidebar-border)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                    {active && <span className="absolute -left-3.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-warm" aria-hidden />}
                    <item.icon weight={active ? "fill" : "regular"} className={cn("relative size-[1.375rem] transition-transform duration-200 group-hover:scale-110", active && "text-brand")} aria-hidden />
                    {count > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-warm ring-2 ring-sidebar" aria-hidden />}
                  </Link>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="relative mt-auto flex flex-col items-center gap-1.5">
        <Tooltip label={<span>Search <kbd className="ml-1 font-sans opacity-70">Ctrl K</kbd></span>} side="right">
          <button type="button" onClick={() => setCommandOpen(true)} aria-label="Search and commands" className={cn(railButton, "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-white")}>
            <MagnifyingGlass className="size-[1.375rem]" aria-hidden />
          </button>
        </Tooltip>
        <NotificationBell rail />
        <div className="mt-1.5 border-t border-sidebar-border pt-3">
          <UserMenu rail onSignOut={onSignOut} />
        </div>
      </div>
    </aside>
  );
}
