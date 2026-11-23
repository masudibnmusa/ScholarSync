"use client";

import * as React from "react";
import { Trash, UserPlus, UsersFour } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { addCourseTA, getCourseTAs, removeCourseTA } from "@/app/actions";
import { useLive } from "@/lib/store";
import type { CourseTA } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";

/** The course instructor adds and removes teaching assistants (other staff accounts) by email. */
export function TeachingAssistants({ courseId }: { courseId: string }) {
  const { t } = useT();
  const [items, setItems] = React.useState<CourseTA[] | null>(null);
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<CourseTA | null>(null);

  const load = React.useCallback(() => getCourseTAs(courseId).then(setItems).catch((err) => {
    console.error("Loading TAs failed:", err);
    setItems((x) => x ?? []);
  }), [courseId]);
  const live = useLive("course_tas");
  React.useEffect(() => { load(); }, [load, live]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t("Enter an email address."));
    setAdding(true);
    setError(null);
    try {
      const r = await addCourseTA(courseId, email);
      if (r === "not-staff") setError(t("No staff account has that email. TAs need a staff account, like yours."));
      else if (r === "self") setError(t("You already teach this course."));
      else {
        toast.success(t("TA added. They were notified."));
        setEmail("");
        await load();
      }
    } catch (err) {
      console.error("Adding the TA failed:", err);
      setError(t("Could not add the TA. Please try again."));
    }
    setAdding(false);
  }

  async function remove() {
    if (!removing) return;
    try {
      await removeCourseTA(courseId, removing.userId);
      await load();
    } catch (err) {
      console.error("Removing the TA failed:", err);
      toast.error(t("Could not remove the TA"));
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <span className="flex size-8 items-center justify-center rounded-xl bg-sage text-success"><UsersFour weight="fill" className="size-4" aria-hidden /></span>
        {t("Teaching assistants")}
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{t("TAs see every team in this course and can grade, give hand-in feedback and moderate the help board. They can't change the course, its students or teams, or release grades.")}</p>
      {!items ? <Skeleton className="h-12" /> : items.length > 0 && (
        <ul className="mb-4 divide-y rounded-2xl border" aria-label={t("Teaching assistants")}>
          {items.map((ta) => (
            <li key={ta.userId} className="flex items-center gap-3 px-3.5 py-2.5">
              <Avatar name={ta.name} id={ta.userId} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{ta.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{ta.email}</span>
              </span>
              <Button size="icon-sm" variant="ghost" aria-label={t("Remove {name} as TA", { name: ta.name })} onClick={() => setRemoving(ta)}><Trash aria-hidden /></Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} noValidate className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="ta-email" className="sr-only">{t("TA's email")}</label>
          <Input id="ta-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder={t("ta@university.edu")}
            aria-invalid={!!error || undefined} aria-describedby={error ? "ta-email-error" : undefined} />
          {error && <p id="ta-email-error" role="alert" className="mt-1.5 text-sm font-medium text-destructive">{error}</p>}
        </div>
        <Button type="submit" variant="outline" loading={adding}>{!adding && <UserPlus aria-hidden />}{t("Add TA")}</Button>
      </form>
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}
        title={t("Remove {name} as TA?", { name: removing?.name ?? "" })} description={t("They stop seeing this course's teams. Grades they gave stay.")}
        confirmLabel={t("Remove")} onConfirm={remove} />
    </Card>
  );
}
