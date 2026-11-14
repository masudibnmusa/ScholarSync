"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  TrendingUp,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Download,
} from "@/components/icons";
import { cn, getLastName } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

function SimpleBar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-6 bg-muted/50 rounded-md overflow-hidden relative">
        <div
          className={cn("h-full rounded-md transition-all duration-500", color)}
          style={{ width: `${(value / max) * 100}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
          {value}%
        </span>
      </div>
    </div>
  );
}

export function AnalyticsPanel() {
  const { teams, kanbanTasks } = useAppStore();

  const teamData = teams.map((t) => ({
    name: t.name,
    health: t.healthScore,
    progress: t.progress,
    members: t.members,
  }));

  // Compute real stats
  const avgProgress = teams.length
    ? Math.round(teams.reduce((s, t) => s + t.progress, 0) / teams.length)
    : 0;
  const avgHealth = teams.length
    ? Math.round(teams.reduce((s, t) => s + t.healthScore, 0) / teams.length)
    : 0;
  const totalStudents = teams.reduce((s, t) => s + t.members.length, 0);
  const doneTasks = kanbanTasks.filter((t) => t.status === "done").length;

  // Average participation (from member contributions)
  const allContributions = teams.flatMap((t) => t.members.map((m) => m.contribution));
  const avgParticipation = allContributions.length
    ? Math.round(allContributions.reduce((s, v) => s + v, 0) / allContributions.length)
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="heading-6">Analytics Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Class-wide performance metrics and team insights
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="w-3.5 h-3.5" />
          Export Report
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="w-3.5 h-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="participation" className="gap-2">
            <Users className="w-3.5 h-3.5" />
            Participation
          </TabsTrigger>
          <TabsTrigger value="sentiment" className="gap-2">
            <TrendingUp className="w-3.5 h-3.5" />
            Sentiment
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Summary Stats - computed from real data */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="border-border/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Avg. Progress</p>
                <p className="heading-5">{avgProgress}%</p>
                <div className="flex items-center gap-1 text-xs text-emerald-500 mt-1">
                  <ArrowUpRight className="w-3 h-3" /> Computed from {teams.length} teams
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Avg. Participation</p>
                <p className="heading-5">{avgParticipation}%</p>
                <div className="flex items-center gap-1 text-xs text-emerald-500 mt-1">
                  <ArrowUpRight className="w-3 h-3" /> {totalStudents} students
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Avg. Health</p>
                <p className="heading-5">{avgHealth}/100</p>
                <div className="flex items-center gap-1 text-xs text-emerald-500 mt-1">
                  <ArrowUpRight className="w-3 h-3" /> Team health score
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Tasks Completed</p>
                <p className="heading-5">{doneTasks}</p>
                <div className="flex items-center gap-1 text-xs text-emerald-500 mt-1">
                  <ArrowUpRight className="w-3 h-3" /> of {kanbanTasks.length} total
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Progress Bars by Team */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <h3 className="font-semibold">Team Progress Comparison</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {teamData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No team data available</p>
              ) : (
                teamData.map((t) => (
                  <div key={t.name}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {t.members.length} members
                        </Badge>
                      </div>
                      <span className="text-sm font-bold">{t.progress}%</span>
                    </div>
                    <Progress value={t.progress} className="h-3" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Health Score Chart */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <h3 className="font-semibold">Group Health Scores</h3>
              </CardHeader>
              <CardContent className="space-y-3">
                {teamData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                ) : (
                  teamData.map((t) => (
                    <SimpleBar
                      key={t.name}
                      value={t.health}
                      max={100}
                      label={t.name}
                      color={t.health >= 80 ? "bg-emerald-500" : t.health >= 60 ? "bg-amber-500" : "bg-red-500"}
                    />
                  ))
                )}
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <h3 className="font-semibold">Task Distribution</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm">To Do</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-muted-foreground/30 rounded-full"
                          style={{
                            width: kanbanTasks.length
                              ? `${(kanbanTasks.filter((t) => t.status === "todo").length / kanbanTasks.length) * 100}%`
                              : "0%",
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold">{kanbanTasks.filter((t) => t.status === "todo").length}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50">
                    <span className="text-sm">In Progress</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-amber-100 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{
                            width: kanbanTasks.length
                              ? `${(kanbanTasks.filter((t) => t.status === "in-progress").length / kanbanTasks.length) * 100}%`
                              : "0%",
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold">{kanbanTasks.filter((t) => t.status === "in-progress").length}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-green-50">
                    <span className="text-sm">Done</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-green-100 overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{
                            width: kanbanTasks.length
                              ? `${(kanbanTasks.filter((t) => t.status === "done").length / kanbanTasks.length) * 100}%`
                              : "0%",
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold">{doneTasks}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="participation" className="mt-4 space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <h3 className="font-semibold">Participation Distribution</h3>
              <p className="text-xs text-muted-foreground">
                Individual contribution balance within each team
              </p>
            </CardHeader>
            <CardContent>
              {teamData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No team data</p>
              ) : (
                teamData.map((team) => (
                  <div key={team.name} className="mb-6 last:mb-0">
                    <h4 className="font-medium text-sm mb-3">{team.name}</h4>
                    <div className="flex items-center gap-1 h-8 rounded-lg overflow-hidden bg-muted/50">
                      {team.members.map((m, i) => {
                        const colors = ["bg-primary", "bg-emerald-500", "bg-teal-500", "bg-amber-500"];
                        return (
                          <div
                            key={m.id}
                            className={cn("h-full transition-all first:rounded-l-lg last:rounded-r-lg", colors[i % colors.length])}
                            style={{ width: `${m.contribution}%` }}
                            title={`${m.name}: ${m.contribution}%`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      {team.members.map((m, i) => {
                        const colors = ["bg-primary", "bg-emerald-500", "bg-teal-500", "bg-amber-500"];
                        return (
                          <div key={m.id} className="flex items-center gap-2">
                            <div className={cn("w-2.5 h-2.5 rounded-full", colors[i % colors.length])} />
                            <span className="text-xs text-muted-foreground">
                              {getLastName(m.name)} ({m.contribution}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sentiment" className="mt-4 space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <h3 className="font-semibold">Team Health / Sentiment Overview</h3>
              <p className="text-xs text-muted-foreground">
                Team health scores as a proxy for overall sentiment and collaboration quality
              </p>
            </CardHeader>
            <CardContent>
              {teamData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No team data</p>
              ) : (
                <div className="space-y-6">
                  {teamData.map((team) => (
                    <div key={team.name}>
                      <h4 className="font-medium text-sm mb-3">{team.name}</h4>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Progress value={team.health} className="h-3 flex-1" />
                            <span className="text-sm font-bold">{team.health}%</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {team.health >= 80
                              ? "Healthy - Good collaboration patterns"
                              : team.health >= 60
                                ? "Moderate - Some areas for improvement"
                                : "At Risk - Attention needed"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
