"use client";

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
} from "lucide-react";

const studentNavItems: {
  icon: typeof LayoutDashboard;
  label: string;
  view: View;
  badgeKey?: "notifications";
}[] = [
  { icon: LayoutDashboard, label: "Dashboard", view: "student-dashboard" },
  { icon: MessageSquare, label: "Chat", view: "student-chat" },
  { icon: KanbanSquare, label: "Tasks", view: "student-tasks" },
  { icon: FolderOpen, label: "Files", view: "student-files" },
  {
    icon: Bell,
    label: "Notifications",
    view: "student-notifications",
    badgeKey: "notifications",
  },
  { icon: Star, label: "Peer Review", view: "student-peer-review" },
  { icon: User, label: "Profile", view: "student-profile" },
];

const instructorNavItems: {
  icon: typeof LayoutDashboard;
  label: string;
  view: View;
  badgeKey?: "conflicts";
}[] = [
  { icon: LayoutDashboard, label: "Dashboard", view: "instructor-dashboard" },
  { icon: Users, label: "Teams", view: "instructor-teams" },
  { icon: BarChart3, label: "Analytics", view: "instructor-analytics" },
  {
    icon: AlertTriangle,
    label: "Conflicts",
    view: "instructor-conflicts",
    badgeKey: "conflicts",
  },
  {
    icon: BrainCircuit,
    label: "AI Matching",
    view: "instructor-matching",
  },
];

export function AppSidebar() {
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

  if (!currentUser) return null;

  const isInstructor = currentUser.role === "instructor";
  const navItems = isInstructor ? instructorNavItems : studentNavItems;
  const conflictCount = conflictAlerts.filter((c) => !c.isResolved).length;

  const getBadgeCount = (key?: string) => {
    if (!key) return 0;
    if (key === "notifications") return unreadNotifCount;
    if (key === "conflicts") return conflictCount;
    return 0;
  };

  return (
    <div
      className={cn(
        "h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 ease-in-out border-r border-sidebar-border",
        sidebarCollapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border shrink-0">
        <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center shrink-0">
          <GraduationCap className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        {!sidebarCollapsed && (
          <div className="overflow-hidden">
            <h2 className="font-bold text-sm tracking-tight truncate">
              CampusNova
            </h2>
            <p className="text-[11px] text-sidebar-foreground/50 truncate">
              {isInstructor ? "Instructor Panel" : "Student Workspace"}
            </p>
          </div>
        )}
      </div>

      {/* Team Selector (Student only) */}
      {!isInstructor && (
        <div className="px-3 pt-3 pb-1">
          {!sidebarCollapsed ? (
            <div className="rounded-lg bg-sidebar-accent/50 p-2">
              <p className="text-[11px] text-sidebar-foreground/40 px-2 mb-1.5 uppercase tracking-wider">
                Current Team
              </p>
              <div className="space-y-0.5">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => {
                      useAppStore.getState().setSelectedTeam(team);
                      if (currentView.startsWith("student-")) setView(currentView);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors",
                      selectedTeam?.id === team.id
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "hover:bg-sidebar-accent text-sidebar-foreground/70"
                    )}
                  >
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{team.name}</span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "ml-auto text-[10px] px-1.5 shrink-0",
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
            <div className="w-full flex justify-center py-1">
              <div className="w-9 h-9 rounded-lg bg-sidebar-accent/50 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
          )}
        </div>
      )}

      <ScrollArea className="flex-1 px-3 py-2">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const badge = getBadgeCount(item.badgeKey);
            return (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group relative",
                  currentView === item.view
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/20"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-[18px] h-[18px] shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="font-medium truncate">{item.label}</span>
                    {badge > 0 && (
                      <Badge className="ml-auto bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0 h-5 min-w-[20px] justify-center">
                        {badge}
                      </Badge>
                    )}
                  </>
                )}
                {sidebarCollapsed && badge > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
                )}
              </button>
            );
          })}
        </nav>
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      {/* Footer */}
      <div className="p-3 space-y-2 shrink-0">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-sidebar-accent/30">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
                {getInitials(currentUser.name)}
              </AvatarFallback>
            </Avatar>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-medium truncate">
                {currentUser.name}
              </p>
              <p className="text-[11px] text-sidebar-foreground/50 truncate">
                {currentUser.email}
              </p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent h-9 w-9",
              sidebarCollapsed && "w-full"
            )}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </Button>
          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent h-9 w-9"
              onClick={() => setView("student-profile")}
            >
              <Settings className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "text-destructive/80 hover:text-destructive hover:bg-destructive/10 h-9 w-9",
              sidebarCollapsed && "w-full"
            )}
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
