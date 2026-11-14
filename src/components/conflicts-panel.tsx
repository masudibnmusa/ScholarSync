"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Eye,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";

const formatTime = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 1) return "just now";
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
};

export function ConflictsPanel() {
  const { conflictAlerts, resolveConflict, fetchConflicts } = useAppStore();

  useEffect(() => {
    fetchConflicts();
  }, [fetchConflicts]);

  const activeConflicts = conflictAlerts.filter((c) => !c.isResolved);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="heading-6">Conflict Alerts</h2>
          <p className="text-sm text-muted-foreground">
            AI-detected team friction and collaboration issues
          </p>
        </div>
        <Badge
          variant="outline"
          className="border-red-200 text-red-600 bg-red-50 px-3 py-1"
        >
          <AlertTriangle className="w-3.5 h-3.5 mr-1" />
          {activeConflicts.length} Active Alert{activeConflicts.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {conflictAlerts.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No conflicts right now"
          body="Team chats are checked for tone once a day. If a team starts to struggle, an alert appears here."
        />
      ) : (
        <div className="space-y-4">
          {conflictAlerts.map((conflict) => (
            <Card
              key={conflict.id}
              className={cn(
                "border-border/50 transition-colors",
                conflict.isResolved && "opacity-60"
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        conflict.severity === "high"
                          ? "bg-red-50"
                          : conflict.severity === "medium"
                            ? "bg-amber-50"
                            : "bg-emerald-50"
                      )}
                    >
                      <AlertTriangle
                        className={cn(
                          "w-5 h-5",
                          conflict.severity === "high"
                            ? "text-red-500"
                            : conflict.severity === "medium"
                              ? "text-amber-500"
                              : "text-emerald-500"
                        )}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{conflict.teamName}</h3>
                        <Badge
                          className={cn(
                            "text-xs",
                            conflict.severity === "high"
                              ? "bg-red-100 text-red-700 border-red-200"
                              : conflict.severity === "medium"
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : "bg-emerald-100 text-emerald-700 border-emerald-200"
                          )}
                          variant="outline"
                        >
                          {conflict.severity}
                        </Badge>
                        {conflict.isResolved && (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Resolved
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        Detected {formatTime(conflict.createdAt)}
                      </p>
                    </div>
                  </div>
                  {!conflict.isResolved && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Eye className="w-3.5 h-3.5" />
                        Review
                      </Button>
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={() => resolveConflict(conflict.id)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Resolve
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {conflict.description}
                </p>

                {/* Sentiment Score */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Sentiment Score:
                  </span>
                  <Badge
                    className={cn(
                      "text-xs",
                      conflict.sentimentScore >= 7
                        ? "bg-green-100 text-green-700"
                        : conflict.sentimentScore >= 5
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    )}
                  >
                    {conflict.sentimentScore}/10
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
