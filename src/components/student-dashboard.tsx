"use client";

import { useAppStore } from "@/lib/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  MessageSquare,
  KanbanSquare,
  FolderOpen,
  Users,
  TrendingUp,
  Clock,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Zap,
} from "@/components/icons";
import { cn } from "@/lib/utils";

export function StudentDashboard() {
  const { currentUser, teams, kanbanTasks, chatMessages, selectedTeam, files, setView } =
    useAppStore();

  const team = selectedTeam || teams[0];
  const teamId = team?.id || "";
  const todoTasks = kanbanTasks.filter((t) => t.status === "todo").length;
  const inProgressTasks = kanbanTasks.filter(
    (t) => t.status === "in-progress"
  ).length;
  const doneTasks = kanbanTasks.filter((t) => t.status === "done").length;
  const teamMessages = chatMessages[teamId]?.length || 0;
  const teamFiles = files.length;

  const stats = [
    {
      label: "Tasks Completed",
      value: doneTasks,
      total: kanbanTasks.length,
      icon: CheckCircle2,
      color: "text-green-500",
      bg: "bg-green-50",
    },
    {
      label: "In Progress",
      value: inProgressTasks,
      total: kanbanTasks.length,
      icon: Zap,
      color: "text-amber-500",
      bg: "bg-amber-50",
    },
    {
      label: "Messages",
      value: teamMessages,
      icon: MessageSquare,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Team Health",
      value: `${team?.healthScore || 0}%`,
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Welcome Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="heading-5">
            Welcome back, {currentUser?.name?.split(" ")[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s what&apos;s happening with {team?.name || "your project"}
          </p>
        </div>
        <Badge
          variant="outline"
          className="flex items-center gap-2 px-3 py-1"
        >
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          AI Features Active
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    stat.bg
                  )}
                >
                  <stat.icon className={cn("w-5 h-5", stat.color)} />
                </div>
                <div>
                  <p className="heading-5">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Project Progress */}
        <Card className="col-span-2 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Project Progress</h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setView("student-tasks")}
              >
                View Board
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Progress
                value={team?.progress || 0}
                className="h-3 flex-1"
              />
              <span className="text-sm font-bold">{team?.progress || 0}%</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <KanbanSquare className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="title-2">{todoTasks}</p>
                  <p className="text-xs text-muted-foreground">To Do</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50">
                <Clock className="w-4 h-4 text-amber-500" />
                <div>
                  <p className="title-2">{inProgressTasks}</p>
                  <p className="text-xs text-muted-foreground">
                    In Progress
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <div>
                  <p className="title-2">{doneTasks}</p>
                  <p className="text-xs text-muted-foreground">Done</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Team Members</h3>
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {team?.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <Avatar className="w-8 h-8">
                  <AvatarFallback
                    className={cn(
                      "text-xs font-bold",
                      m.userId === currentUser?.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {(m.name || "U")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.name}
                    {m.userId === currentUser?.id && (
                      <span className="text-xs text-muted-foreground ml-1">
                        (You)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(m.skills || []).slice(0, 2).join(", ") || "Member"}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="text-xs shrink-0"
                >
                  {m.contribution ?? 0}%
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        <Card
          className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
          onClick={() => setView("student-chat")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Team Chat</p>
              <p className="text-xs text-muted-foreground">
                {teamMessages} messages
              </p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
          onClick={() => setView("student-files")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="font-medium text-sm">Shared Files</p>
              <p className="text-xs text-muted-foreground">
                {teamFiles} file{teamFiles !== 1 ? "s" : ""} uploaded
              </p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
          onClick={() => setView("student-peer-review")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-teal-500" />
            </div>
            <div>
              <p className="font-medium text-sm">Peer Review</p>
              <p className="text-xs text-muted-foreground">
                {team?.members.length ? team.members.length - 1 : 0} review{team && team.members.length > 2 ? "s" : ""} pending
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
