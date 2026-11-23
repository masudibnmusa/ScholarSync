"use client";

import * as React from "react";
import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { findRetroThemes, getRetros, saveRetro } from "@/app/actions";
import { timeAgo } from "@/lib/utils";
import { useLive } from "@/lib/store";
import type { Milestone, RetroThemes, Team, TeamRetro } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";

/** Student: the team's shared retrospective on a milestone. Any member writes or edits it. */
export function RetroDialog({ team, milestone, open, onOpenChange, onSaved }: {
  team: Team; milestone: Milestone; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const { t } = useT();
  const [form, setForm] = React.useState<{ wentWell: string; didnt: string } | null>(null);
  const [last, setLast] = React.useState<TeamRetro | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getRetros(milestone.id).then((list) => {
      const mine = list.find((r) => r.teamId === team.id) ?? null;
      setLast(mine);
      setForm((f) => f ?? { wentWell: mine?.wentWell ?? "", didnt: mine?.didnt ?? "" }); // never over what's being typed
    }).catch((err) => {
      console.error("Loading the retrospective failed:", err);
      setForm((f) => f ?? { wentWell: "", didnt: "" });
    });
  }, [milestone.id, team.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || (!form.wentWell.trim() && !form.didnt.trim())) return setError(t("Write at least one of the two."));
    setSaving(true);
    try {
      await saveRetro(team.id, milestone.id, form);
      toast.success(t("Retrospective saved. Your team and instructor can read it."));
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("Saving the retrospective failed:", err);
      setError(t("Could not save it. Please try again."));
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Retrospective: {title}", { title: milestone.title })}</DialogTitle>
          <DialogDescription>
            {t("One for the whole team: anyone can edit it. Your instructor reads every team's to see what to change.")}
            {last && <> {t("Last edited by {name}, {when}.", { name: last.updatedByName, when: timeAgo(last.updatedAt) })}</>}
          </DialogDescription>
        </DialogHeader>
        {!form ? <Skeleton className="h-40" /> : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <Field label={t("What went well?")} htmlFor="retro-well">
              <Textarea id="retro-well" value={form.wentWell} rows={4} maxLength={2000} placeholder={t("e.g. Splitting the work early, daily check-ins…")}
                onChange={(e) => { const v = e.target.value; setForm((f) => f && { ...f, wentWell: v }); setError(null); }} />
            </Field>
            <Field label={t("What didn't?")} htmlFor="retro-didnt" error={error}>
              <Textarea id="retro-didnt" value={form.didnt} rows={4} maxLength={2000} placeholder={t("e.g. Merging at the last minute, unclear owners…")}
                onChange={(e) => { const v = e.target.value; setForm((f) => f && { ...f, didnt: v }); setError(null); }} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("Cancel")}</Button>
              <Button type="submit" loading={saving}>{t("Save retrospective")}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ThemeList({ title, items }: { title: string; items: RetroThemes["wentWell"] }) {
  const { t } = useT();
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {items.length ? (
        <ul className="mt-1.5 space-y-1.5" aria-label={title}>
          {items.map((x, i) => (
            <li key={i} className="text-sm">
              <span className="font-semibold">{x.theme}</span>
              {x.teams.length > 0 && <span className="text-muted-foreground"> · {x.teams.join(", ")}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-sm text-muted-foreground">{t("Nothing in common.")}</p>}
    </div>
  );
}

/** Instructor: every team's retrospective on a milestone, who hasn't written one, and AI themes across them. */
export function RetroReview({ milestone, teams, open, onOpenChange }: { milestone: Milestone; teams: Team[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useT();
  const [items, setItems] = React.useState<TeamRetro[] | null>(null);
  const [themes, setThemes] = React.useState<RetroThemes | null>(null);
  const [finding, setFinding] = React.useState(false);
  const live = useLive("team_retros");
  React.useEffect(() => {
    getRetros(milestone.id).then(setItems).catch((err) => {
      console.error("Loading retrospectives failed:", err);
      setItems((x) => x ?? []);
    });
  }, [milestone.id, live]);

  async function find() {
    setFinding(true);
    try {
      setThemes(await findRetroThemes(milestone.id));
    } catch (err) {
      console.error("Finding themes failed:", err);
      toast.error(t("Could not find themes just now. Try again in a moment."));
    }
    setFinding(false);
  }

  const missing = items ? teams.filter((tt) => !items.some((r) => r.teamId === tt.id)) : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Retrospectives: {title}", { title: milestone.title })}</DialogTitle>
          <DialogDescription>
            {items ? t("{n} of {total} teams wrote one.", { n: items.length, total: teams.length }) : " "}
            {missing.length > 0 && <> {t("Not yet: {list}.", { list: missing.map((tt) => tt.name).join(", ") })}</>}
          </DialogDescription>
        </DialogHeader>
        {!items ? <Skeleton className="h-40" /> : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto scroll-thin">
            {items.length >= 2 && (
              <section aria-labelledby="retro-themes" className="rounded-2xl bg-muted/50 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id="retro-themes" className="flex items-center gap-1.5 text-sm font-bold"><Sparkle weight="fill" className="size-4 text-primary" aria-hidden /> {t("Themes across teams")}</h3>
                  <Button size="sm" variant="outline" className="ml-auto" loading={finding} onClick={find}>{themes ? t("Find again") : t("Find themes")}</Button>
                </div>
                {themes ? (
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <ThemeList title={t("Went well")} items={themes.wentWell} />
                    <ThemeList title={t("Didn't go well")} items={themes.didnt} />
                  </div>
                ) : <p className="mt-1 text-xs text-muted-foreground">{t("The AI groups what the teams wrote into common themes. Check it against their own words below.")}</p>}
              </section>
            )}
            <ul className="space-y-3">
              {items.map((r) => (
                <li key={r.teamId} className="rounded-2xl border p-3.5" aria-label={t("Retrospective from {team}", { team: r.teamName })}>
                  <p className="text-sm font-bold">{r.teamName} <span className="font-normal text-muted-foreground">· {r.updatedByName}, {timeAgo(r.updatedAt)}</span></p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div><p className="text-xs font-bold text-success">{t("Went well")}</p><p className="whitespace-pre-line text-sm">{r.wentWell || "—"}</p></div>
                    <div><p className="text-xs font-bold text-destructive">{t("Didn't go well")}</p><p className="whitespace-pre-line text-sm">{r.didnt || "—"}</p></div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
