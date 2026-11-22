"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Circle, Handshake, PencilSimple, Scroll } from "@phosphor-icons/react/dist/ssr";
import { agreeToCharter, getCharter, saveCharter } from "@/app/actions";
import { useLive } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";
import type { CharterText, Team, TeamCharter } from "@/lib/types";
import { useUser } from "@/components/app/user-context";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const PARTS = [
  { key: "roles", label: "Roles", placeholder: "Who does what? e.g. Ada: backend and database. Ben: the UI. Cy: testing and the report." },
  { key: "meetings", label: "Meeting times", placeholder: "When and where you meet, e.g. Tuesdays 6pm online, and ten minutes after each lab." },
  { key: "missedWork", label: "When work is missed", placeholder: "e.g. Say so in chat a day before the deadline. Missed twice: we talk to the instructor." },
  { key: "communication", label: "How we communicate", placeholder: "e.g. Team chat for everything, replies within a day, decisions written down." },
] as const;

function CharterForm({ team, initial, onSaved, onCancel }: { team: Team; initial?: CharterText; onSaved: () => void; onCancel?: () => void }) {
  const [form, setForm] = React.useState<CharterText>(initial ?? { roles: "", meetings: "", missedWork: "", communication: "" });
  const [saving, setSaving] = React.useState(false);
  const empty = PARTS.every((p) => !form[p.key].trim());
  const changed = !initial || PARTS.some((p) => form[p.key].trim() !== initial[p.key]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveCharter(team.id, form);
      toast.success(initial ? "Charter updated" : "Charter saved", { description: "Your teammates were asked to read it and agree." });
      onSaved();
    } catch (err) {
      console.error("Saving the charter failed:", err);
      toast.error("Could not save the charter");
    }
    setSaving(false);
  }

  return (
    <form onSubmit={save} className="space-y-3" aria-label="Team charter">
      {PARTS.map((p) => (
        <Field key={p.key} label={p.label} htmlFor={`charter-${p.key}`}>
          <Textarea id={`charter-${p.key}`} rows={2} maxLength={2000} value={form[p.key]} placeholder={p.placeholder}
            onChange={(e) => setForm({ ...form, [p.key]: e.target.value })} />
        </Field>
      ))}
      <div className="flex items-center justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={saving} disabled={empty || !changed}>{!saving && <Handshake aria-hidden />}{initial ? "Save changes" : "Save charter"}</Button>
      </div>
    </form>
  );
}

/**
 * The team charter: what the team agreed on at the start. Members write, edit and agree to it; editing asks everyone
 * else to agree again. The instructor reads it and sees who agreed. `?charter=1` opens it, as the notifications do.
 */
export function CharterButton({ team }: { team: Team }) {
  const user = useUser();
  const instructor = user.role === "instructor";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromLink = params.get("charter") === "1";
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<TeamCharter | undefined>(undefined);
  const [editing, setEditing] = React.useState(false);
  const [agreeing, setAgreeing] = React.useState(false);
  const live = useLive("team_charters", "charter_agreements", "team_members");
  const isOpen = open || fromLink;
  const readOnly = instructor || team.courseArchived;

  const load = React.useCallback(() => getCharter(team.id).then(setData).catch((err) => console.error("Loading the charter failed:", err)), [team.id]);
  React.useEffect(() => { load(); }, [load, live]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setEditing(false);
    if (!next && fromLink) {
      const rest = new URLSearchParams(params.toString());
      rest.delete("charter");
      router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
    }
  }

  async function agree() {
    setAgreeing(true);
    try {
      await agreeToCharter(team.id);
      toast.success("You agreed to the charter");
      await load();
    } catch (err) {
      console.error("Agreeing failed:", err);
      toast.error("Could not record your agreement");
    }
    setAgreeing(false);
  }

  const c = data?.charter;
  const mine = data?.members.find((m) => m.userId === user.id);
  const agreed = data?.members.filter((m) => m.agreedAt) ?? [];
  const owes = !readOnly && !!data && (!c || !mine?.agreedAt);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label={owes ? (c ? "Team charter (waiting for you to agree)" : "Team charter (not written yet)") : "Team charter"} className="relative">
          <Scroll weight="duotone" aria-hidden />
          <span className="hidden xl:inline">Charter</span>
          {owes && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" aria-hidden />}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-butter text-warm-text"><Scroll weight="fill" className="size-4" aria-hidden /></span>
            {team.name}&apos;s charter
          </DialogTitle>
          <DialogDescription>
            {instructor ? "What the team agreed on: roles, meetings, missed work and how they talk." : "What your team agrees on, so everyone knows what to expect. Anyone on the team can edit it."}
          </DialogDescription>
        </DialogHeader>

        {data === undefined ? (
          <div className="space-y-3" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-16" /></div>
        ) : editing || (!c && !readOnly) ? (
          <CharterForm team={team} initial={c ?? undefined} onSaved={() => { setEditing(false); load(); }} onCancel={c ? () => setEditing(false) : undefined} />
        ) : !c ? (
          <p className="rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
            {instructor ? "The team hasn't written a charter yet." : "No charter was written."}
          </p>
        ) : (
          <div className="min-w-0 space-y-5">
            <dl className="space-y-3">
              {PARTS.map((p) => (
                <div key={p.key} className="rounded-2xl bg-muted/50 px-4 py-3">
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{p.label}</dt>
                  <dd className={cn("mt-1 whitespace-pre-wrap text-[0.9375rem]", !c[p.key] && "text-muted-foreground")}>{c[p.key] || "Not decided yet"}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">Last changed {timeAgo(c.updatedAt)}{c.updatedByName ? ` by ${c.updatedByName}` : ""}</p>

            <section aria-labelledby="charter-agreed">
              <h3 id="charter-agreed" className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Agreed ({agreed.length} of {data.members.length})
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2">
                    <Avatar id={m.userId} name={m.name} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</span>
                    {m.agreedAt
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><CheckCircle weight="fill" className="size-4" aria-hidden />Agreed</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Circle className="size-4" aria-hidden />Not yet</span>}
                  </li>
                ))}
              </ul>
            </section>

            {!readOnly && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(true)}><PencilSimple aria-hidden /> Edit</Button>
                {!mine?.agreedAt && <Button loading={agreeing} onClick={agree}>{!agreeing && <Handshake aria-hidden />} I agree</Button>}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
