"use client";

import { useAppStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  MessageSquare,
  KanbanSquare,
  Clock,
  Users,
  AlertTriangle,
  Check,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const notifIcons: Record<string, typeof Bell> = {
  mention: MessageSquare,
  task: KanbanSquare,
  deadline: Clock,
  team: Users,
  conflict: AlertTriangle,
};

const notifColors: Record<string, string> = {
  mention: "bg-primary/10 text-primary",
  task: "bg-violet-100 text-violet-600",
  deadline: "bg-amber-100 text-amber-600",
  team: "bg-emerald-100 text-emerald-600",
  conflict: "bg-red-100 text-red-600",
};

const formatNotifTime = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
};

export function NotificationsPanel() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useAppStore();

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={unreadCount === 0}
          onClick={() => markAllNotificationsRead()}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Mark all as read
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="w-12 h-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No notifications</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const Icon = notifIcons[notif.type] || Bell;
              const colorClass = notifColors[notif.type] || "bg-muted text-muted-foreground";
              return (
                <Card
                  key={notif.id}
                  className={cn(
                    "transition-colors cursor-pointer hover:border-primary/20",
                    !notif.read
                      ? "border-primary/20 bg-primary/[0.02]"
                      : "border-border/50"
                  )}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                        colorClass
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className="text-sm font-semibold">{notif.title}</h4>
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {notif.description}
                      </p>
                      <p className="text-[11px] text-muted-foreground/60 mt-1.5">
                        {formatNotifTime(notif.createdAt)}
                      </p>
                    </div>
                    {!notif.read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          markNotificationRead(notif.id);
                        }}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
