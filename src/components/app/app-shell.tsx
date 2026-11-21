"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { DotsThreeOutline, WifiSlash } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";
import { isActive, navFor } from "@/components/app/nav";
import { CommandMenu } from "@/components/app/command-menu";
import { useAppInstallSetup } from "@/components/app/push";
import { NavLinks, Sidebar, useBadgeCounts } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { UserProvider, useUser } from "@/components/app/user-context";
import { Dialog, DialogDescription, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { EASE } from "@/components/ui/motion";

function MobileNav() {
  const pathname = usePathname();
  const user = useUser();
  const counts = useBadgeCounts();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const items = navFor(user.role);
  const primary = items.filter((n) => !n.secondary);
  const secondary = items.filter((n) => n.secondary);
  const moreActive = secondary.some((n) => isActive(pathname, n.href));
  const moreCount = secondary.reduce((sum, n) => sum + (n.badge ? counts[n.badge] : 0), 0);

  const tab = "tap relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[0.6875rem] font-semibold transition-colors";

  return (
    <nav aria-label="Main" className="z-30 flex shrink-0 items-stretch gap-1 border-t bg-card/95 px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden">
      {primary.map((n) => {
        const active = isActive(pathname, n.href);
        const count = n.badge ? counts[n.badge] : 0;
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn(tab, active ? "text-primary" : "text-muted-foreground")}>
            {active && <motion.span layoutId="tab-pill" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="relative">
              <n.icon weight={active ? "fill" : "regular"} className="size-6" aria-hidden />
              {count > 0 && <span className="absolute -right-1 -top-0.5 size-2.5 rounded-full bg-warm ring-2 ring-card" />}
            </span>
            <span className="max-w-full truncate">{n.short ?? n.label}</span>
            {count > 0 && <span className="sr-only">, {count} new</span>}
          </Link>
        );
      })}
      {secondary.length > 0 && (
        <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className={cn(tab, moreActive ? "text-primary" : "text-muted-foreground")}>
            {moreActive && <motion.span layoutId="tab-pill" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />}
            <span className="relative">
              <DotsThreeOutline weight={moreActive ? "fill" : "regular"} className="size-6" aria-hidden />
              {moreCount > 0 && <span className="absolute -right-1 -top-0.5 size-2.5 rounded-full bg-warm ring-2 ring-card" />}
            </span>
            More
          </button>
          <SheetContent side="bottom" className="bg-sidebar p-4 pt-5 text-sidebar-foreground">
            <DialogTitle className="mb-3 px-3 text-sm font-bold">More</DialogTitle>
            <DialogDescription className="sr-only">Other sections of your workspace</DialogDescription>
            <NavLinks items={secondary} pillId="sheet-pill" onNavigate={() => setMoreOpen(false)} />
          </SheetContent>
        </Dialog>
      )}
    </nav>
  );
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};

/** Shown while the device is offline: the page shows the last copy saved on this device. */
function OfflineBanner() {
  const online = React.useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b bg-butter px-4 py-2 text-sm text-foreground sm:px-6 lg:px-8">
      <WifiSlash weight="bold" className="size-4 shrink-0" aria-hidden />
      <p><span className="font-bold">You&apos;re offline.</span> Showing what this device saw last. Messages you write are sent when you&apos;re back.</p>
    </div>
  );
}

export function AppShell({ user, sidebarCollapsed, children }: { user: UserProfile; sidebarCollapsed: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const mainRef = React.useRef<HTMLElement>(null);
  useAppInstallSetup();

  // Load this user's data and live updates once the shell is in the browser.
  React.useEffect(() => {
    useAppStore.getState().boot(user);
  }, [user]);

  const signOut = React.useCallback(async () => {
    await useAppStore.getState().logout();
    toast.success("Signed out");
    router.replace("/");
    router.refresh();
  }, [router]);

  // Signed out in another tab, or the session expired.
  React.useEffect(() => {
    const { data } = supabaseBrowser().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  React.useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <UserProvider user={user}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground">
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar onSignOut={signOut} initialCollapsed={sidebarCollapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onSignOut={signOut} />
          <OfflineBanner />
          <main id="main" ref={mainRef} tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto outline-none scroll-thin">
            <motion.div key={pathname} className="h-full" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
              {children}
            </motion.div>
          </main>
          <MobileNav />
        </div>
      </div>
      <CommandMenu onSignOut={signOut} />
    </UserProvider>
  );
}
