"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BellSlash, Check, Checks } from "@phosphor-icons/react/dist/ssr";
import { useAppStore } from "@/lib/store";
import { cn, dayLabel, timeAgo } from "@/lib/utils";
import type { Notification } from "@/lib/types";
import { notificationHref } from "@/components/app/nav";
import { EmptyState, Page, PageHeader } from "@/components/app/page";
import { notificationIcon } from "@/components/app/topbar";
import { useUser } from "@/components/app/user-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/overlays";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";
import { num } from "@/lib/i18n";

export function NotificationsPanel() {
  const { t } = useT();
  const user = useUser();
  const router = useRouter();
  const notifications = useAppStore((s) => s.notifications);
  const loaded = useAppStore((s) => s.loaded.notifications);
  const unread = useAppStore((s) => s.unreadNotifCount);
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAll = useAppStore((s) => s.markAllNotificationsRead);
  const [filter, setFilter] = React.useState<"all" | "unread">("all");

  const visible = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;
  const groups = visible.reduce<{ label: string; items: Notification[] }[]>((acc, n) => {
    const label = dayLabel(n.createdAt);
    const last = acc[acc.length - 1];
    if (last?.label === label) last.items.push(n);
    else acc.push({ label, items: [n] });
    return acc;
  }, []);

  return (
    <Page className="max-w-3xl">
      <PageHeader title={t("Notifications")} description={unread ? t("{n} unread", { n: unread }) : t("You're all caught up.")}>
        <Button variant="outline" onClick={markAll} disabled={!unread}><Checks aria-hidden /> {t("Mark all read")}</Button>
      </PageHeader>

      <Segmented label={t("Filter notifications")} value={filter} onChange={setFilter}
        options={[{ value: "all", label: t("All") }, { value: "unread", label: <>{t("Unread")}{unread > 0 && <span className="rounded-full bg-warm px-1.5 text-[0.6875rem] font-extrabold text-warm-foreground">{num(unread)}</span>}</> }]} />

      {!loaded ? (
        <div className="space-y-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[4.5rem]" />)}</div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon={BellSlash} title={filter === "unread" ? t("Nothing unread") : t("No notifications yet")}
            description={filter === "unread" ? t("You've read everything. Enjoy the quiet.") : t("New tasks, messages and reviews will show up here as they happen.")}>
            {filter === "unread" && notifications.length > 0 && <Button variant="outline" onClick={() => setFilter("all")}>{t("Show all")}</Button>}
          </EmptyState>
        </Card>
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{g.label}</h2>
            <Card className="overflow-hidden">
              <ul className="divide-y">
                <AnimatePresence initial={false}>
                  {g.items.map((n) => {
                    const meta = notificationIcon[n.type] ?? notificationIcon.system;
                    return (
                      <motion.li key={n.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                        className={cn("group relative flex items-center gap-1 transition-colors hover:bg-accent/50", !n.read && "bg-secondary/40")}>
                        {!n.read && <span className="absolute inset-y-0 left-0 w-1 bg-warm" aria-hidden />}
                        <button type="button" onClick={() => { if (!n.read) markRead(n.id); router.push(notificationHref(n.type, user.role, n.link)); }}
                          className="flex min-w-0 flex-1 items-start gap-3.5 px-4 py-3.5 text-left sm:px-5">
                          <span className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl", meta.className)}>
                            <meta.icon weight="fill" className="size-5" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("block text-sm", n.read ? "font-semibold" : "font-extrabold")}>{n.title}{!n.read && <span className="sr-only"> {t("(unread)")}</span>}</span>
                            {n.description && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.description}</span>}
                            <time dateTime={n.createdAt} className="mt-1 block text-xs text-muted-foreground">{timeAgo(n.createdAt)}</time>
                          </span>
                        </button>
                        {!n.read && (
                          <Tooltip label={t("Mark as read")}>
                            <Button variant="ghost" size="icon" className="mr-2 shrink-0" aria-label={t("Mark \"{title}\" as read", { title: n.title })} onClick={() => markRead(n.id)}>
                              <Check weight="bold" className="size-4" />
                            </Button>
                          </Tooltip>
                        )}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </Card>
          </section>
        ))
      )}
    </Page>
  );
}
