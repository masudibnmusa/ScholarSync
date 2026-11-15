"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import { ChatsCircle, MagnifyingGlass, Moon, Plus, SignOut, Sun, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { useAppStore } from "@/lib/store";
import { navFor } from "@/components/app/nav";
import { useUser } from "@/components/app/user-context";

const item =
  "flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-sm font-medium text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-[1.125rem] [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
const group =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-muted-foreground";

export function CommandMenu({ onSignOut }: { onSignOut: () => void }) {
  const open = useAppStore((s) => s.commandOpen);
  const setOpen = useAppStore((s) => s.setCommandOpen);
  const teams = useAppStore((s) => s.teams);
  const setSelectedTeam = useAppStore((s) => s.setSelectedTeam);
  const user = useUser();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!useAppStore.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command menu"
      overlayClassName="fixed inset-0 z-50 bg-scrim/55 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      contentClassName="fixed left-1/2 top-[12dvh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-3xl border bg-popover text-popover-foreground shadow-lift data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-4"
    >
      <div className="flex items-center gap-3 border-b px-4">
        <MagnifyingGlass className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <Command.Input placeholder="Search pages, teams and actions…" className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground" />
        <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground sm:block">Esc</kbd>
      </div>
      <Command.List className="max-h-[min(28rem,60dvh)] overflow-y-auto p-2 scroll-thin">
        <Command.Empty className="px-3 py-10 text-center text-sm text-muted-foreground">Nothing matches that search.</Command.Empty>

        <Command.Group heading="Go to" className={group}>
          {navFor(user.role).map((n) => (
            <Command.Item key={n.href} value={`go ${n.label}`} onSelect={() => run(() => router.push(n.href))} className={item}>
              <n.icon aria-hidden />
              {n.label}
            </Command.Item>
          ))}
        </Command.Group>

        {(user.role === "instructor" || teams.length > 1) && teams.length > 0 && (
          <Command.Group heading="Teams" className={group}>
            {teams.map((t) => (
              <Command.Item
                key={t.id}
                value={`team ${t.name}`}
                onSelect={() => run(() => {
                  setSelectedTeam(t);
                  if (user.role === "instructor") router.push(`/instructor?team=${t.id}`);
                })}
                className={item}
              >
                <UsersThree aria-hidden />
                {t.name}
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{t.progress}% done</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Actions" className={group}>
          {user.role === "student" && (
            <>
              <Command.Item value="new task create" onSelect={() => run(() => router.push("/student?new=1"))} className={item}>
                <Plus aria-hidden />
                New task
              </Command.Item>
              <Command.Item value="team chat open messages" onSelect={() => run(() => router.push("/student?view=chat"))} className={item}>
                <ChatsCircle aria-hidden />
                Open team chat
              </Command.Item>
            </>
          )}
          <Command.Item value="theme dark light toggle" onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))} className={item}>
            {resolvedTheme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
            Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
          </Command.Item>
          <Command.Item value="sign out log out" onSelect={() => run(onSignOut)} className={item}>
            <SignOut aria-hidden />
            Sign out
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
