"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  BrainCircuit,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  Play,
  Zap,
  Target,
} from "@/components/icons";
import { cn, getInitials } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { runTeamMatching, applyTeamMatching } from "@/app/actions";
import { useAppStore } from "@/lib/store";

type MatchResult = Awaited<ReturnType<typeof runTeamMatching>>;

export function AIMatchingPanel() {
  const { fetchTeams } = useAppStore();
  const [isRunning, setIsRunning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [result, setResult] = useState<MatchResult>(null);
  const [ran, setRan] = useState(false);

  const proposals = result?.proposals ?? [];
  const studentCount = proposals.reduce((n, t) => n + t.members.length, 0);
  const steps = ["Load enrolled students", "Compare skills", "Match availability", "Balance teams"];

  const run = async () => {
    setIsRunning(true);
    try {
      setResult(await runTeamMatching(3));
      setRan(true);
    } catch (err) {
      toast({ title: "Matching failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  const approve = async () => {
    if (!result) return;
    setIsApplying(true);
    try {
      await applyTeamMatching(result.courseId, proposals.map((t) => ({ name: t.name, memberIds: t.members.map((m) => m.id) })));
      toast({ title: "Teams created", description: `${proposals.length} teams added to ${result.courseTitle}.` });
      setResult(null);
      setRan(false);
      await fetchTeams();
    } catch (err) {
      toast({ title: "Could not create teams", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="heading-6">AI Team Matching</h2>
          <p className="text-sm text-muted-foreground">
            Group enrolled students who are not on a team yet into balanced teams
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={run} disabled={isRunning || isApplying}>
          {isRunning ? (
            <>
              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              Run Matching
            </>
          )}
        </Button>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Matching Engine</h3>
            <Badge variant="secondary" className="text-xs">Gemini</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">Parameters</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Course</span>
                  <span className="font-medium">{result?.courseTitle ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Students to place</span>
                  <span className="font-medium">{ran ? studentCount : "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Team size</span>
                  <span className="font-medium">about 3 per team</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">Steps</p>
              <div className="space-y-2">
                {steps.map((label) => (
                  <div
                    key={label}
                    className={cn(
                      "flex items-center gap-2 text-sm p-2 rounded-md",
                      ran ? "text-emerald-600 bg-emerald-50" : "text-muted-foreground"
                    )}
                  >
                    {ran ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : isRunning ? (
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Target className="w-3.5 h-3.5" />
                    )}
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {isRunning && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary animate-pulse" />
                <p className="text-sm font-medium">Gemini is comparing student profiles. This can take a minute.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {ran && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Suggested Teams</h3>
              </div>
              {proposals.length > 0 && (
                <Button size="sm" className="gap-2" onClick={approve} disabled={isApplying}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isApplying ? "Creating..." : "Approve All & Create Teams"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {proposals.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {result ? "Every enrolled student is already on a team." : "You don't teach any course yet."}
              </p>
            )}
            {proposals.map((team, idx) => (
              <div key={team.name + idx} className="p-4 rounded-xl border border-primary/20 bg-primary/[0.02]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {String.fromCharCode(65 + (idx % 26))}
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{team.name}</h4>
                    <Badge
                      className={cn(
                        "text-xs mt-0.5",
                        team.score >= 90 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {team.score}% match
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {team.members.map((member) => (
                    <div key={member.id} className="flex items-center gap-2 px-3 py-1 rounded-lg bg-muted/50">
                      <Avatar className="w-5 h-5">
                        <AvatarFallback className="text-xs bg-muted font-bold">{getInitials(member.name)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">{member.name}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Target className="w-3 h-3 text-emerald-500" />
                  {team.strengths.map((st) => (
                    <Badge key={st} variant="secondary" className="text-xs">{st}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
