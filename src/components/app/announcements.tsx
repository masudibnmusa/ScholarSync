"use client";

import * as React from "react";
import { Megaphone, PaperPlaneTilt, Trash } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { deleteAnnouncement, getAnnouncements, postAnnouncement } from "@/app/actions";
import { timeAgo } from "@/lib/utils";
import type { Announcement } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLive } from "@/lib/store";

const SHOWN = 3;

/** Course announcements: the instructor posts (students are notified), everyone in the course reads. */
export function Announcements({ courseId, canPost }: { courseId: string; canPost: boolean }) {
  const [items, setItems] = React.useState<Announcement[] | null>(null);
  const [all, setAll] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", body: "" });
  const [posting, setPosting] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Announcement | null>(null);

  const load = React.useCallback(() => getAnnouncements(courseId).then(setItems).catch((err) => {
    console.error("Loading announcements failed:", err);
    setItems((x) => x ?? []);
  }), [courseId]);
  const live = useLive("course_announcements");
  React.useEffect(() => { load(); }, [load, live]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setPosting(true);
    try {
      await postAnnouncement(courseId, form);
      setForm({ title: "", body: "" });
      toast.success("Posted. Every student in the course was notified.");
      await load();
    } catch (err) {
      console.error("Posting announcement failed:", err);
      toast.error("Could not post the announcement");
    }
    setPosting(false);
  }

  async function remove(a: Announcement) {
    try {
      await deleteAnnouncement(a.id);
      await load();
    } catch (err) {
      console.error("Deleting announcement failed:", err);
      toast.error("Could not delete the announcement");
    }
  }

  // Students only see the card when there is something to read.
  if (!canPost && items && !items.length) return null;
  const shown = all ? items : items?.slice(0, SHOWN);

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
        <span className="flex size-8 items-center justify-center rounded-xl bg-peach text-primary"><Megaphone weight="fill" className="size-4" aria-hidden /></span>
        Announcements
      </h2>

      {canPost && (
        <form onSubmit={post} className="mb-4 space-y-2 rounded-2xl bg-muted/50 p-3">
          <label htmlFor="ann-title" className="sr-only">Announcement title</label>
          <Input id="ann-title" value={form.title} maxLength={120} placeholder="Title, e.g. Lab moved to room 402" onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label htmlFor="ann-body" className="sr-only">Details</label>
          <Textarea id="ann-body" value={form.body} maxLength={4000} rows={2} placeholder="Details (optional)" onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Every enrolled student gets a notification.</p>
            <Button type="submit" size="sm" loading={posting} disabled={!form.title.trim()}>{!posting && <PaperPlaneTilt aria-hidden />}Post</Button>
          </div>
        </form>
      )}

      {!shown ? (
        <Skeleton className="h-16" />
      ) : !shown.length ? (
        <p className="text-sm text-muted-foreground">Nothing posted yet.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((a) => (
            <li key={a.id} className="group/ann border-l-2 border-primary/40 pl-3">
              <p className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-[0.9375rem] font-bold">{a.title}</span>
                {canPost && (
                  <button type="button" onClick={() => setDeleting(a)} aria-label={`Delete announcement: ${a.title}`}
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/ann:opacity-100 max-md:opacity-100">
                    <Trash className="size-4" aria-hidden />
                  </button>
                )}
              </p>
              {a.body && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground/85">{a.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{a.authorName} · <time dateTime={a.createdAt}>{timeAgo(a.createdAt)}</time></p>
            </li>
          ))}
        </ul>
      )}
      {items && items.length > SHOWN && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${items.length}`}</Button>
      )}

      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete this announcement?"
        description="Students won't see it on the course page any more. Notifications already sent stay." onConfirm={() => deleting && remove(deleting)} />
    </Card>
  );
}
