"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  BrainCircuit,
  ArrowRight,
  Activity,
  Eye,
  Heart,
} from "@/components/icons";
import { cn, getInitials, getLastName } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";

export function InstructorDashboard() {
  const { teams, conflictAlerts, fetchConflicts, setView } = useAppStore();

  useEffect(() => {
    fetchConflicts();
  }, [fetchConflicts]);

  const totalStudents = teams.reduce((sum, t) => sum + t.members.length, 0);
  const avgHealth = teams.length
    ? Math.round(teams.reduce((sum, t) => sum + t.healthScore, 0) / teams.length)
    : 0;
  const avgProgress = teams.length
    ? Math.round(teams.reduce((sum, t) => sum + t.progress, 0) / teams.length)
    : 0;
  const activeConflicts = conflictAlerts.filter((c) => !c.isResolved).length;

  const stats = [
    {
      label: "Total Teams",
      value: teams.length,
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Total Students",
      value: totalStudents,
      icon: Activity,
      color: "text-teal-500",
      bg: "bg-teal-50",
    },
    {
      label: "Avg. Health",
      value: `${avgHealth}%`,
      icon: Heart,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
    },
    {
      label: "Avg. Progress",
      value: `${avgProgress}%`,
      icon: TrendingUp,
      color: "text-amber-500",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Welcome */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="heading-5">Instructor Dashboard 👨‍🏫</h1>
          <p className="text-muted-foreground mt-1">
            Monitor team performance, sentiment, and project progress
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setView("instructor-matching")}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            AI Matching
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setView("instructor-analytics")}>
            <BarChart3 className="w-3.5 h-3.5" />
            Full Analytics
          </Button>
        </div>
      </div>

      {/* Stats */}
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

      {/* Team Overview */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Team Overview</h3>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setView("instructor-teams")}
            >
              Manage Teams
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {teams.length === 0 ? (
            <EmptyState
              icon={BrainCircuit}
              title="No teams yet"
              body="Match your class into teams to see their progress and health here."
              action={{ label: "Open team matching", onClick: () => useAppStore.getState().setView("instructor-matching") }}
            />
          ) : (
            <div className="space-y-4">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-sm">{team.name}</h4>
                      <Badge variant="secondary" className="text-xs">
                        {team.members.length} members
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <Progress value={team.progress} className="h-2 flex-1" />
                        <span className="text-xs font-medium w-8">
                          {team.progress}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {team.members.slice(0, 3).map((m) => (
                        <div key={m.id} className="flex items-center gap-1">
                          <Avatar className="w-5 h-5">
                            <AvatarFallback className="text-xs bg-muted">
                              {getInitials(m.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground">
                            {getLastName(m.name)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={cn(
                        "heading-5",
                        team.healthScore >= 80
                          ? "text-emerald-500"
                          : team.healthScore >= 60
                            ? "text-amber-500"
                            : "text-red-500"
                      )}
                    >
                      {team.healthScore}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Health Score
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setView("instructor-teams")}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Card
          className="border-border/50 cursor-pointer hover:border-red-200 transition-colors"
          onClick={() => setView("instructor-conflicts")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="font-medium text-sm">Conflict Alerts</p>
              <p className="text-xs text-muted-foreground">
                {activeConflicts} active alert{activeConflicts !== 1 ? "s" : ""} require{activeConflicts === 1 ? "s" : ""} attention
              </p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
          onClick={() => setView("instructor-matching")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-teal-500" />
            </div>
            <div>
              <p className="font-medium text-sm">AI Team Matching</p>
              <p className="text-xs text-muted-foreground">
                Run intelligent team formation algorithm
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
