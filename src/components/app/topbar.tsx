"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bell, BellSlash, CheckCircle, Checks, ChatCircleDots, Desktop, MagnifyingGlass, Moon, SignOut, Star, Sun, UserCircle, Warning,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { useAppStore } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";
import { homeFor, isActive, navFor, notificationHref } from "@/components/app/nav";
import { Logo } from "@/components/app/page";
import { useUser } from "@/components/app/user-context";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/overlays";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const notificationIcon: Record<string, { icon: Icon; className: string }> = {
  task: { icon: CheckCircle, className: "bg-primary/10 text-primary" },
  message: { icon: ChatCircleDots, className: "bg-info/12 text-info" },
  review: { icon: Star, className: "bg-warm/15 text-warm-text" },
  conflict: { icon: Warning, className: "bg-destructive/12 text-destructive" },
  system: { icon: Bell, className: "bg-muted text-muted-foreground" },
};

export function NotificationBell({ rail }: { rail?: boolean }) {
  const user = useUser();
  const router = useRouter();
  const notifications = useAppStore((s) => s.notifications);
  const unread = useAppStore((s) => s.unreadNotifCount);
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAll = useAppStore((s) => s.markAllNotificationsRead);
  const latest = notifications.slice(0, 5);

  return (
    <Popover>
      <Tooltip label="Notifications" side={rail ? "right" : "bottom"}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className={cn("relative", rail && "size-11 rounded-xl text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-white")} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
            <Bell weight={unread ? "fill" : "regular"} className={rail ? "size-[1.375rem]" : "size-5"} />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 flex size-2.5">
                <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-warm" />
                <span className={cn("relative inline-flex size-2.5 rounded-full bg-warm ring-2", rail ? "ring-sidebar" : "ring-background")} />
              </span>
            )}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side={rail ? "right" : "bottom"} align="end" className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-sm font-bold">Notifications</p>
          {unread > 0 && (
            <button type="button" onClick={markAll} className="inline-flex items-center gap-1 rounded-md text-xs font-semibold text-primary hover:underline">
              <Checks className="size-3.5" aria-hidden /> Mark all read
            </button>
          )}
        </div>
        {latest.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <BellSlash weight="duotone" className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">You're all caught up</p>
            <p className="text-xs text-muted-foreground">New tasks, messages and reviews show up here.</p>
          </div>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto scroll-thin">
            {latest.map((n) => {
              const meta = notificationIcon[n.type] ?? notificationIcon.system;
              return (
                <li key={n.id}>
                  <PopoverClose asChild>
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.read) markRead(n.id);
                        router.push(notificationHref(n.type, user.role));
                      }}
                      className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60", !n.read && "bg-secondary/40")}
                    >
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", meta.className)}>
                        <meta.icon weight="fill" className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{n.title}</span>
                        {n.description && <span className="block truncate text-xs text-muted-foreground">{n.description}</span>}
                        <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                      </span>
                      {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-warm" aria-label="Unread" />}
                    </button>
                  </PopoverClose>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t p-2">
          <PopoverClose asChild>
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href={`${homeFor(user.role)}/notifications`}>View all notifications</Link>
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function UserMenu({ onSignOut, rail }: { onSignOut: () => void; rail?: boolean }) {
  const user = useUser();
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("tap flex items-center rounded-full p-0.5 transition-shadow", rail ? "hover:ring-4 hover:ring-white/15" : "ml-1 hover:ring-4 hover:ring-primary/15")} aria-label={`Account menu for ${user.name}`}>
        <Avatar name={user.name} size="sm" className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side={rail ? "right" : "bottom"} align="end" className="w-64">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`${homeFor(user.role)}/profile`}><UserCircle aria-hidden /> Your profile</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light"><Sun aria-hidden /> Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon aria-hidden /> Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Desktop aria-hidden /> System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onSignOut}><SignOut aria-hidden /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phone/tablet header. On desktop the rail carries search, notifications and the account menu. */
export function Topbar({ onSignOut }: { onSignOut: () => void }) {
  const user = useUser();
  const pathname = usePathname();
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const current = navFor(user.role).find((n) => isActive(pathname, n.href));

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-xl sm:px-5 lg:hidden">
      <Link href={homeFor(user.role)} className="rounded-xl" aria-label="ScholarSync home">
        <Logo label={false} />
      </Link>
      <p className="min-w-0 flex-1 truncate text-sm font-bold">{current?.label ?? "ScholarSync"}</p>
      <Tooltip label="Search">
        <Button variant="ghost" size="icon" onClick={() => setCommandOpen(true)} aria-label="Search">
          <MagnifyingGlass className="size-5" />
        </Button>
      </Tooltip>
      <NotificationBell />
      <UserMenu onSignOut={onSignOut} />
    </header>
  );
}
