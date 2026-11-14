"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Star,
  Send,
  CheckCircle2,
  Award,
  Loader2,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

const categories = [
  { label: "Communication", key: "comm" },
  { label: "Technical Skills", key: "tech" },
  { label: "Reliability", key: "reliability" },
  { label: "Leadership", key: "leadership" },
  { label: "Teamwork", key: "teamwork" },
];

export function PeerReviewPanel() {
  const { currentUser, selectedTeam, submitPeerReview } = useAppStore();
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [categoryRatings, setCategoryRatings] = useState<Record<string, Record<string, number>>>({});
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

  // Get teammates from selected team, excluding current user
  const teammates = (selectedTeam?.members || []).filter(
    (m) => m.userId !== currentUser?.id
  );

  const handleSetRating = (mateId: string, star: number) => {
    setRatings((r) => ({ ...r, [mateId]: star }));
    // Initialize category ratings when overall rating changes
    if (!categoryRatings[mateId]) {
      const initCats: Record<string, number> = {};
      categories.forEach((c) => (initCats[c.key] = star));
      setCategoryRatings((cr) => ({ ...cr, [mateId]: initCats }));
    }
  };

  const handleSetCategoryRating = (mateId: string, catKey: string, val: number) => {
    setCategoryRatings((cr) => ({
      ...cr,
      [mateId]: { ...(cr[mateId] || {}), [catKey]: val },
    }));
  };

  const handleSubmitReview = async (mateId: string) => {
    if (!selectedTeam) return;
    const overallRating = ratings[mateId] || 0;
    const fb = feedback[mateId] || "";
    const cats = categoryRatings[mateId] || {};

    setIsSubmitting(mateId);
    if (await submitPeerReview(selectedTeam.id, mateId, overallRating, fb, cats)) {
      setSubmitted((s) => ({ ...s, [mateId]: true }));
    }
    setIsSubmitting(null);
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto h-full overflow-y-auto">
      <div>
        <h2 className="text-xl font-bold">Peer Review</h2>
        <p className="text-sm text-muted-foreground">
          Provide anonymous feedback for your teammates
        </p>
      </div>

      {/* Review Status */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Star className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{teammates.length}</p>
              <p className="text-xs text-muted-foreground">Reviews Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-lg font-bold">
                {Object.keys(submitted).length}
              </p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Award className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-lg font-bold">
                {teammates.length > 0
                  ? ((Object.keys(submitted).length / teammates.length) * 100).toFixed(0)
                  : 0}%
              </p>
              <p className="text-xs text-muted-foreground">Progress</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Review Forms */}
      {teammates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No teammates found. Join a team first.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {teammates.map((mate) => (
            <Card key={mate.id} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-muted font-bold text-sm">
                      {getInitials(mate.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="font-semibold">{mate.name || "Unknown"}</h3>
                    <p className="text-xs text-muted-foreground">
                      {(Array.isArray(mate.skills) ? mate.skills : []).slice(0, 2).join(", ") || "Team member"}
                    </p>
                  </div>
                  {submitted[mate.userId] && (
                    <Badge className="bg-green-100 text-green-700 border-green-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Submitted
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Overall Rating */}
                <div>
                  <p className="text-sm font-medium mb-2">Overall Rating</p>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleSetRating(mate.userId, star)}
                        disabled={!!submitted[mate.userId]}
                        className="p-0.5 hover:scale-110 transition-transform"
                      >
                        <Star
                          className={cn(
                            "w-6 h-6 transition-colors",
                            (ratings[mate.userId] || 0) >= star
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground/30"
                          )}
                        />
                      </button>
                    ))}
                    <span className="text-sm text-muted-foreground ml-2">
                      {ratings[mate.userId] || 0}/5
                    </span>
                  </div>
                </div>

                {/* Category Ratings */}
                <div className="grid grid-cols-2 gap-3">
                  {categories.map((cat) => (
                    <div
                      key={cat.key}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50"
                    >
                      <span className="text-xs font-medium">{cat.label}</span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            disabled={!!submitted[mate.userId]}
                            onClick={() => handleSetCategoryRating(mate.userId, cat.key, s)}
                          >
                            <div
                              className={cn(
                                "w-2 h-2 rounded-full transition-colors",
                                (categoryRatings[mate.userId]?.[cat.key] || 0) >= s
                                  ? "bg-primary"
                                  : "bg-border"
                              )}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Comments */}
                <div>
                  <p className="text-sm font-medium mb-2">Additional Feedback</p>
                  <Textarea
                    placeholder="Share your thoughts about this teammate's contribution..."
                    className="min-h-[80px] resize-none"
                    disabled={!!submitted[mate.userId]}
                    value={feedback[mate.userId] || ""}
                    onChange={(e) =>
                      setFeedback((f) => ({ ...f, [mate.userId]: e.target.value }))
                    }
                  />
                </div>

                {!submitted[mate.userId] && (
                  <Button
                    className="w-full gap-2"
                    onClick={() => handleSubmitReview(mate.userId)}
                    disabled={isSubmitting === mate.userId || (ratings[mate.userId] || 0) === 0}
                  >
                    {isSubmitting === mate.userId ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Submit Review (Anonymous)
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
