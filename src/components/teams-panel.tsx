"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  ArrowLeftRight,
  CheckCircle2,
  Sparkles,
  Heart,
  Activity,
} from "@/components/icons";
import { cn, getInitials } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";

export function TeamsPanel() {
  const { teams, setView } = useAppStore();

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="heading-6">Team Management</h2>
          <p className="text-sm text-muted-foreground">
            Review and manage team assignments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2" onClick={() => setView("instructor-matching")}>
            <Sparkles className="w-3.5 h-3.5" />
            Run AI Matching
          </Button>
        </div>
      </div>

      {teams.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No teams in your course yet"
          body="Team matching groups enrolled students by skills and availability. You review the proposal before anything is created."
          action={{ label: "Open team matching", onClick: () => useAppStore.getState().setView("instructor-matching") }}
        />
      ) : (
        <div className="space-y-4">
          {teams.map((team) => (
            <Card key={team.id} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{team.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-xs">
                          {team.members.length} members
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs border",
                            team.healthScore >= 80
                              ? "border-green-200 text-green-600 bg-green-50"
                              : team.healthScore >= 60
                                ? "border-yellow-200 text-yellow-600 bg-yellow-50"
                                : "border-red-200 text-red-600 bg-red-50"
                          )}
                        >
                          <Heart className="w-3 h-3 mr-1" />
                          Health: {team.healthScore}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Reassign
                    </Button>
                    <Button size="sm" className="gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground font-medium">
                      Progress
                    </span>
                    <Progress value={team.progress} className="h-2 flex-1" />
                    <span className="text-xs font-bold">{team.progress}%</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {team.members.map((member) => (
                      <div
                        key={member.id}
                        className="p-3 rounded-lg border border-border/50 hover:border-primary/20 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="text-xs bg-muted font-bold">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {member.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {member.skills.slice(0, 2).join(", ") || "Member"}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                          >
                            <ArrowLeftRight className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {member.skills.slice(0, 3).map((skill) => (
                            <Badge
                              key={skill}
                              variant="secondary"
                              className="text-xs px-2"
                            >
                              {skill}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <Activity className="w-3 h-3 text-muted-foreground" />
                          <Progress
                            value={member.contribution}
                            className="h-1.5 flex-1"
                          />
                          <span className="text-xs font-medium">
                            {member.contribution}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
