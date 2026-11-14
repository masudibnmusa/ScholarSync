"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useAppStore, type View } from "@/lib/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, getInitials } from "@/lib/utils";
import {
  LayoutDashboard,
  MessageSquare,
  KanbanSquare,
  FolderOpen,
  Bell,
  Star,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Users,
  BarChart3,
  AlertTriangle,
  BrainCircuit,
  Settings,
} from "@/components/icons";

type NavItem = {
  icon: typeof LayoutDashboard;
  label: string;
  view: View;
  badgeKey?: "notifications" | "conflicts";
};

const studentNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", view: "student-dashboard" },
  { icon: MessageSquare, label: "Team chat", view: "student-chat" },
  { icon: KanbanSquare, label: "Tasks", view: "student-tasks" },
  { icon: FolderOpen, label: "Files", view: "student-files" },
  { icon: Bell, label: "Notifications", view: "student-notifications", badgeKey: "notifications" },
  { icon: Star, label: "Peer review", view: "student-peer-review" },
  { icon: User, label: "Profile", view: "student-profile" },
];

const instructorNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", view: "instructor-dashboard" },
  { icon: Users, label: "Teams", view: "instructor-teams" },
  { icon: BarChart3, label: "Analytics", view: "instructor-analytics" },
  { icon: AlertTriangle, label: "Conflicts", view: "instructor-conflicts", badgeKey: "conflicts" },
  { icon: BrainCircuit, label: "Team matching", view: "instructor-matching" },
];

export const navLabel = (view: View) =>
  [...studentNavItems, ...instructorNavItems].find((i) => i.view === view)?.label ?? "";

const focusRing = "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/60";

export function AppSidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const {
    currentView,
    currentUser,
    sidebarCollapsed,
    toggleSidebar,
    setView,
    logout,
    selectedTeam,
    teams,
    unreadNotifCount,
    conflictAlerts,
  } = useAppStore();
  const reduce = useReducedMotion();

  if (!currentUser) return null;

  const collapsed = !mobile && sidebarCollapsed;
  const isInstructor = currentUser.role === "instructor";
  const navItems = isInstructor ? instructorNavItems : studentNavItems;
  const conflictCount = conflictAlerts.filter((c) => !c.isResolved).length;

  const getBadgeCount = (key?: NavItem["badgeKey"]) =>
    key === "notifications" ? unreadNotifCount : key === "conflicts" ? conflictCount : 0;

  const go = (view: View) => {
    setView(view);
    onNavigate?.();
  };

  return (
    <div
      className={cn(
        "h-full text-sidebar-foreground flex flex-col",
        mobile ? "w-full bg-transparent" : "bg-sidebar border-r border-sidebar-border",
        mobile ? "" : collapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      {/* Header */}
      {!mobile && (
        <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border shrink-0">
          <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="title-4 truncate">CampusNova</p>
              <p className="caption-5 text-sidebar-foreground/60 truncate">
                {isInstructor ? "Instructor workspace" : "Student workspace"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Team selector (students) */}
      {!isInstructor && teams.length > 0 && (
        <div className="px-3 pt-3 pb-1">
          {!collapsed ? (
            <div className="rounded-xl bg-sidebar-accent/60 p-2">
              <p className="caption-3 uppercase tracking-wider text-sidebar-foreground/50 px-2 mb-2">Current team</p>
              <div className="space-y-0.5">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    aria-pressed={selectedTeam?.id === team.id}
                    onClick={() => useAppStore.getState().setSelectedTeam(team)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 min-h-11 rounded-lg body-6 transition-[color,background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
                      focusRing,
                      selectedTeam?.id === team.id
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "hover:bg-sidebar-accent text-sidebar-foreground/80"
                    )}
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    <span className="truncate">{team.name}</span>
                    <Badge
                      variant="secondary"
                      title="Team health"
                      className={cn(
                        "ml-auto caption-3 px-2 shrink-0",
                        team.healthScore >= 80
                          ? "bg-green-500/20 text-green-400"
                          : team.healthScore >= 60
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-red-500/20 text-red-400"
                      )}
                    >
                      {team.healthScore}%
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center py-1" title={selectedTeam?.name}>
              <div className="w-9 h-9 rounded-lg bg-sidebar-accent/60 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
          )}
        </div>
      )}

      <ScrollArea className="flex-1 px-3 py-2">
        <nav aria-label="Workspace">
          <ul className="space-y-1">
            {navItems.map((item, i) => {
              const badge = getBadgeCount(item.badgeKey);
              const active = currentView === item.view;
              return (
                <motion.li
                  key={item.view}
                  initial={mobile ? { opacity: 0, y: reduce ? 0 : 24 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: Math.min(i * 0.06, 0.4) }}
                >
                  <button
                    onClick={() => go(item.view)}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 min-h-11 rounded-lg relative transition-[color,background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
                      mobile ? "title-2" : "title-4",
                      focusRing,
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" weight={active ? "fill" : "regular"} />
                    {!collapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
                        {badge > 0 && (
                          <Badge className="ml-auto bg-destructive text-white caption-3 px-2 py-0 h-5 min-w-5 justify-center">
                            {badge}
                          </Badge>
                        )}
                      </>
                    )}
                    {collapsed && badge > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" aria-label={`${badge} new`} />
                    )}
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </nav>
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      {/* Footer */}
      <div className="p-3 space-y-2 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-sidebar-accent/40">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground caption-3">
                {getInitials(currentUser.name)}
              </AvatarFallback>
            </Avatar>
            <div className="overflow-hidden flex-1">
              <p className="title-4 truncate">{currentUser.name}</p>
              <p className="caption-5 text-sidebar-foreground/60 truncate">{currentUser.email}</p>
            </div>
          </div>
        )}
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          {!mobile && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn("text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent h-9 w-9", collapsed && "w-full")}
              onClick={toggleSidebar}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </Button>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Profile settings"
              className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent h-9 w-9"
              onClick={() => go("student-profile")}
            >
              <Settings className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size={mobile ? "default" : "icon"}
            aria-label="Sign out"
            className={cn(
              "text-red-300 hover:text-red-200 hover:bg-red-500/10",
              mobile ? "ml-auto" : "h-9 w-9",
              collapsed && "w-full"
            )}
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            {mobile && "Sign out"}
          </Button>
        </div>
      </div>
    </div>
  );
}
