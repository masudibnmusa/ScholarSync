"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Quote,
  Target,
} from "@/components/icons";

export function AITaskModal() {
  const { showAIModal, dismissAIModal, taskSuggestions, acceptSuggestion, dismissSuggestion } = useAppStore();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusy(id);
    await fn(id);
    setBusy(null);
  };

  return (
    <Dialog open={showAIModal} onOpenChange={(open) => !open && dismissAIModal()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <DialogTitle className="text-lg">AI Task Suggestions</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Tasks the AI found in your team chat. Nothing is added until you accept it.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {taskSuggestions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No suggestions yet. They appear a couple of minutes after the team chats about work.
            </p>
          )}
          {taskSuggestions.map((suggestion) => (
            <Card key={suggestion.id} className="border-border/50 p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Target className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1">{suggestion.title}</h4>
                  {suggestion.description && (
                    <p className="text-xs text-muted-foreground mb-2">{suggestion.description}</p>
                  )}

                  {suggestion.source && (
                    <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 text-xs">
                      <Quote className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-muted-foreground leading-relaxed">{suggestion.source}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      size="sm"
                      className="gap-1 h-7 text-xs"
                      disabled={busy === suggestion.id}
                      onClick={() => run(suggestion.id, acceptSuggestion)}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Accept & Add to Board
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 h-7 text-xs text-muted-foreground"
                      disabled={busy === suggestion.id}
                      onClick={() => run(suggestion.id, dismissSuggestion)}
                    >
                      <XCircle className="w-3 h-3" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
