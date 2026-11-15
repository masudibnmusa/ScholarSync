"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Desktop, EnvelopeSimple, FloppyDisk, Moon, Plus, Sun, UsersThree, X } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Page, PageHeader } from "@/components/app/page";
import { useUser } from "@/components/app/user-context";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useMounted } from "@/hooks/use-client";

const skillIdeas = ["React", "Python", "UI design", "Writing", "Data analysis", "Testing", "Presentation", "Project management", "Research", "SQL"];
const availabilityIdeas = ["Weekday evenings", "Weekends", "Mornings", "Afternoons", "Flexible"];
const MAX_SKILLS = 30;

function SkillsInput({ skills, onChange }: { skills: string[]; onChange: (s: string[]) => void }) {
  const [text, setText] = React.useState("");
  const add = (raw: string) => {
    const skill = raw.trim().replace(/,+$/, "").slice(0, 50);
    if (!skill || skills.length >= MAX_SKILLS || skills.some((s) => s.toLowerCase() === skill.toLowerCase())) return setText("");
    onChange([...skills, skill]);
    setText("");
  };
  const ideas = skillIdeas.filter((i) => !skills.some((s) => s.toLowerCase() === i.toLowerCase())).slice(0, 6);

  return (
    <div className="space-y-2.5">
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-card p-1.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
        <AnimatePresence initial={false}>
          {skills.map((s) => (
            <motion.span key={s} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}
              className="inline-flex items-center gap-1 rounded-lg bg-secondary py-1 pl-2.5 pr-1 text-sm font-semibold text-secondary-foreground">
              {s}
              <button type="button" onClick={() => onChange(skills.filter((x) => x !== s))} aria-label={`Remove ${s}`} className="flex size-5 items-center justify-center rounded-md hover:bg-primary/15">
                <X weight="bold" className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          id="skills"
          value={text}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(text); }
            if (e.key === "Backspace" && !text && skills.length) onChange(skills.slice(0, -1));
          }}
          onBlur={() => text && add(text)}
          placeholder={skills.length ? "Add another…" : "Type a skill and press Enter"}
          aria-describedby="skills-hint"
          className="h-8 min-w-36 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
      {ideas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Ideas:</span>
          {ideas.map((i) => (
            <button key={i} type="button" onClick={() => add(i)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:bg-secondary hover:text-secondary-foreground">
              <Plus weight="bold" className="size-3" aria-hidden />{i}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProfilePanel() {
  const user = useUser();
  const teams = useAppStore((s) => s.teams);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const [bio, setBio] = React.useState(user.bio);
  const [skills, setSkills] = React.useState(user.skills);
  const [availability, setAvailability] = React.useState(user.availability);
  const [saving, setSaving] = React.useState(false);

  const dirty = bio !== user.bio || availability !== user.availability || skills.join("|") !== user.skills.join("|");
  const complete = [user.bio, user.skills.length, user.availability].filter(Boolean).length;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (await updateProfile({ bio: bio.trim(), skills, availability: availability.trim() })) toast.success("Profile saved");
    setSaving(false);
  }

  return (
    <Page className="max-w-5xl">
      <PageHeader title="Profile" description={user.role === "student" ? "Your skills and availability are what AI team matching uses to place you." : "How you appear to your students."} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="relative h-24 bg-sidebar">
              <div className="absolute -right-8 -top-10 size-40 rounded-full bg-brand/40 blur-2xl" aria-hidden />
              <div className="absolute -left-6 bottom-0 size-28 rounded-full bg-warm/30 blur-2xl" aria-hidden />
            </div>
            <div className="relative -mt-10 px-5 pb-5">
              <Avatar name={user.name} size="xl" className="ring-4 ring-card" />
              <h2 className="mt-3 text-xl font-extrabold">{user.name}</h2>
              <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground"><EnvelopeSimple className="size-4 shrink-0" aria-hidden />{user.email}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="solid" className="capitalize">{user.role}</Badge>
                {user.role === "student" && teams.map((t) => <Badge key={t.id}><UsersThree weight="fill" aria-hidden />{t.name}</Badge>)}
              </div>
              {user.availability && <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="size-4 shrink-0" aria-hidden />{user.availability}</p>}
            </div>
            {user.role === "student" && (
              <div className="border-t px-5 py-4">
                <div className="flex items-baseline justify-between text-sm"><span className="font-semibold">Profile strength</span><span className="font-bold tabular-nums text-primary">{complete}/3</span></div>
                <div className="mt-2 flex gap-1.5" aria-hidden>
                  {[0, 1, 2].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-500", i < complete ? "bg-primary" : "bg-muted")} />)}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{complete === 3 ? "Complete. Matching has everything it needs." : "Add a bio, skills and availability for better team matches."}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Appearance</CardTitle><CardDescription>Saved on this device.</CardDescription></div></CardHeader>
            <CardContent>
              <Segmented label="Theme" className="w-full [&>button]:flex-1 [&>button]:justify-center" value={(mounted ? theme : "system") as "light" | "dark" | "system"} onChange={setTheme}
                options={[{ value: "light", label: <><Sun aria-hidden className="size-4" />Light</> }, { value: "dark", label: <><Moon aria-hidden className="size-4" />Dark</> }, { value: "system", label: <><Desktop aria-hidden className="size-4" />Auto</> }]} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><div><CardTitle>About you</CardTitle><CardDescription>Visible to your teammates and instructor.</CardDescription></div></CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-6">
              <Field label="Bio" htmlFor="bio" hint={`${bio.length}/2000 · A sentence or two about what you like working on.`}>
                <Textarea id="bio" value={bio} maxLength={2000} onChange={(e) => setBio(e.target.value)} placeholder="e.g. Third-year CS student. I enjoy frontend work and keeping the team organised." aria-describedby="bio-hint" />
              </Field>

              <div className="space-y-1.5">
                <Label htmlFor="skills">Skills</Label>
                <SkillsInput skills={skills} onChange={setSkills} />
                <p id="skills-hint" className="text-xs text-muted-foreground">Press Enter or comma to add. {skills.length}/{MAX_SKILLS}.</p>
              </div>

              <Field label="Availability" htmlFor="availability" hint="When can your team usually count on you?">
                <Input id="availability" value={availability} maxLength={200} onChange={(e) => setAvailability(e.target.value)} placeholder="e.g. Weekday evenings" aria-describedby="availability-hint" />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {availabilityIdeas.map((a) => (
                    <button key={a} type="button" onClick={() => setAvailability(a)} aria-pressed={availability === a}
                      className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors", availability === a ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:border-primary hover:text-foreground")}>
                      {a}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-5">
                <AnimatePresence>
                  {dirty && (
                    <motion.p initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="mr-auto flex items-center gap-2 text-sm font-medium text-warm-text" role="status">
                      <span className="size-2 rounded-full bg-warm" aria-hidden /> Unsaved changes
                    </motion.p>
                  )}
                </AnimatePresence>
                <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setBio(user.bio); setSkills(user.skills); setAvailability(user.availability); }}>Reset</Button>
                <Button type="submit" loading={saving} disabled={!dirty}><FloppyDisk weight="fill" aria-hidden /> Save profile</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
