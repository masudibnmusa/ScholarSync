"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { MagnifyingGlass, SidebarSimple } from "@phosphor-icons/react/dist/ssr";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { homeFor, isActive, navFor, type NavItem } from "@/components/app/nav";
import { Logo } from "@/components/app/page";
import { UserMenu } from "@/components/app/topbar";
import { useUser } from "@/components/app/user-context";
import { Tooltip } from "@/components/ui/overlays";
import { useStoredValue } from "@/hooks/use-client";

export function useBadgeCounts(): Record<NonNullable<NavItem["badge"]>, number> {
  const notifications = useAppStore((s) => s.unreadNotifCount);
  const conflicts = useAppStore((s) => s.conflictAlerts.filter((c) => !c.isResolved).length);
  const suggestions = useAppStore((s) => s.taskSuggestions.length);
  return { notifications, conflicts, suggestions };
}

/** Full-width nav list: the desktop sidebar and the mobile "More" sheet. `collapsed` shows icons only, labels as tooltips. */
export function NavLinks({ onNavigate, pillId, items, collapsed }: { onNavigate?: () => void; pillId: string; items?: NavItem[]; collapsed?: boolean }) {
  const pathname = usePathname();
  const user = useUser();
  const counts = useBadgeCounts();
  return (
    <ul className="space-y-1">
      {(items ?? navFor(user.role)).map((item) => {
        const active = isActive(pathname, item.href);
        const count = item.badge ? counts[item.badge] : 0;
        const link = (
          <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} aria-label={collapsed ? (count ? `${item.label}, ${count} new` : item.label) : undefined}
            className={cn("tap relative flex h-11 items-center gap-3 rounded-xl text-sm font-semibold transition-colors", collapsed ? "w-11 justify-center" : "px-3",
              active ? "text-sidebar-foreground" : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground")}>
            {active && <motion.span layoutId={pillId} className="absolute inset-0 rounded-xl bg-sidebar-accent shadow-soft" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
            <item.icon weight={active ? "fill" : "regular"} className={cn("relative size-5", active && "text-brand")} aria-hidden />
            {collapsed
              ? count > 0 && <span className="absolute right-2 top-2 size-2.5 rounded-full bg-warm ring-2 ring-sidebar" aria-hidden />
              : <>
                  <span className="relative flex-1 whitespace-nowrap">{item.label}</span>
                  {count > 0 && <span className="relative flex h-5 min-w-5 items-center justify-center rounded-full bg-warm px-1.5 text-[0.6875rem] font-bold tabular-nums text-warm-foreground">{count}<span className="sr-only"> new</span></span>}
                </>}
          </Link>
        );
        return <li key={item.href}>{collapsed ? <Tooltip label={item.label} side="right">{link}</Tooltip> : link}</li>;
      })}
    </ul>
  );
}

/** Desktop navigation: a floating sage panel with labelled links, search and the account card. Collapses to an icon rail. */
export function Sidebar({ onSignOut }: { onSignOut: () => void }) {
  const user = useUser();
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const [collapsed, setCollapsed] = useStoredValue("scholarsync:sidebar-collapsed", false);

  const toggle = (
    <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
      <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}
        className="tap flex size-9 shrink-0 items-center justify-center rounded-xl text-sidebar-muted transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground">
        <SidebarSimple className="size-5" aria-hidden />
      </button>
    </Tooltip>
  );

  return (
    <aside className={cn("relative my-3 ml-3 hidden h-[calc(100dvh-1.5rem)] shrink-0 flex-col overflow-hidden rounded-3xl bg-sidebar p-3 text-sidebar-foreground shadow-soft transition-[width] duration-300 ease-out-expo lg:flex",
      collapsed ? "w-[4.25rem] items-center" : "w-64")}>
      <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "gap-1")}>
        <Link href={`${homeFor(user.role)}/courses`} className="flex min-w-0 flex-1 items-center rounded-2xl p-1.5" aria-label="Course dashboard">
          <Logo label={false} />
          {!collapsed && (
            <span className="ml-2.5 min-w-0">
              <span className="block whitespace-nowrap text-[1.0625rem] font-extrabold leading-tight tracking-tight">ScholarSync</span>
              <span className="block truncate text-xs text-sidebar-muted">{user.role === "instructor" ? "Your teaching hub" : "Your team workspace"}</span>
            </span>
          )}
        </Link>
        {toggle}
      </div>

      {collapsed ? (
        <Tooltip label={<span>Search <kbd className="ml-1 font-sans opacity-70">Ctrl K</kbd></span>} side="right">
          <button type="button" onClick={() => setCommandOpen(true)} aria-label="Search and commands"
            className="tap mt-3 flex size-11 items-center justify-center rounded-xl bg-sidebar-accent/60 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <MagnifyingGlass className="size-5" aria-hidden />
          </button>
        </Tooltip>
      ) : (
        <button type="button" onClick={() => setCommandOpen(true)}
          className="tap mt-4 flex h-10 items-center gap-2.5 whitespace-nowrap rounded-xl bg-sidebar-accent/60 px-3 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
          <MagnifyingGlass className="size-4" aria-hidden />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded-md bg-sidebar px-1.5 py-0.5 font-sans text-[0.6875rem] font-semibold">Ctrl K</kbd>
        </button>
      )}

      <nav aria-label="Main" className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-thin", collapsed ? "mt-3" : "mt-5")}>
        {!collapsed && <p className="mb-2 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-sidebar-muted">Menu</p>}
        <NavLinks pillId="sidebar-pill" collapsed={collapsed} />
      </nav>

      <div className={cn("mt-3", !collapsed && "w-full")}>
        <UserMenu sidebar={collapsed ? "collapsed" : "wide"} onSignOut={onSignOut} />
      </div>
    </aside>
  );
}
