"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowCounterClockwise, ArrowRight, Camera, Check, CircleNotch, Trash, UploadSimple, CheckCircle, Circle, Clock, Desktop, EnvelopeSimple, Eye, FloppyDisk, GithubLogo, Heartbeat, IdentificationBadge, Lightning, Moon, Palette, Plus, Student, Sun, TextAlignLeft, Translate, UsersThree, Warning, X,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { sendSampleDigest } from "@/app/actions";
import { cn } from "@/lib/utils";
import { Page } from "@/components/app/page";
import { PhotoCropDialog } from "@/components/app/photo-crop";
import { AlertsCard } from "@/components/app/push";
import { MyDataCard } from "@/components/app/my-data";
import { useUser } from "@/components/app/user-context";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AVATAR_TYPES } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { EASE } from "@/components/ui/motion";
import { ProgressRing } from "@/components/ui/progress";
import { useMounted } from "@/hooks/use-client";
import { useT } from "@/components/locale";
import { LanguageSwitch } from "@/components/language-switch";
import { msg, t, tn, num } from "@/lib/i18n";

const skillIdeas = ["React", "Python", msg("UI design"), msg("Writing"), msg("Data analysis"), msg("Testing"), msg("Presentation"), msg("Project management"), msg("Research"), "SQL"];
const GITHUB_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const availabilityIdeas = [msg("Weekday evenings"), msg("Weekends"), msg("Mornings"), msg("Afternoons"), msg("Flexible")];
const MAX_SKILLS = 30;

function SkillsInput({ skills, onChange }: { skills: string[]; onChange: (s: string[]) => void }) {
  const { t } = useT();
  const [text, setText] = React.useState("");
  const add = (raw: string) => {
    const skill = raw.trim().replace(/,+$/, "").slice(0, 50);
    if (!skill || skills.length >= MAX_SKILLS || skills.some((s) => s.toLowerCase() === skill.toLowerCase())) return setText("");
    onChange([...skills, skill]);
    setText("");
  };
  const ideas = skillIdeas.map((i) => t(i)).filter((i) => !skills.some((s) => s.toLowerCase() === i.toLowerCase())).slice(0, 6);

  return (
    <div className="space-y-2.5">
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-card p-1.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
        <AnimatePresence initial={false}>
          {skills.map((s) => (
            <motion.span key={s} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}
              className="inline-flex items-center gap-1 rounded-lg bg-secondary py-1 pl-2.5 pr-1 text-sm font-semibold text-secondary-foreground">
              {s}
              <button type="button" onClick={() => onChange(skills.filter((x) => x !== s))} aria-label={t("Remove {s}", { s })} className="flex size-5 items-center justify-center rounded-md hover:bg-primary/15">
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
          placeholder={skills.length ? t("Add another…") : t("Type a skill and press Enter")}
          aria-describedby="skills-hint"
          className="h-8 min-w-36 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
      {ideas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("Ideas:")}</span>
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

/** A titled block inside the form card. */
function Section({ icon: I, title, hint, htmlFor, children }: { icon: Icon; title: string; hint: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 px-5 py-6 sm:px-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
      <div>
        <label htmlFor={htmlFor} className="flex items-center gap-2 text-sm font-bold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><I weight="duotone" className="size-4" aria-hidden /></span>
          {title}
        </label>
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Theme picker as small screen mock-ups. */
const themes = [
  { value: "light", label: msg("Light"), icon: Sun, bg: "#f7f0e6", card: "#fffbf5", bar: "#cdd9c6", line: "#ecdfcf" },
  { value: "dark", label: msg("Dark"), icon: Moon, bg: "#171310", card: "#211b16", bar: "#1f2a22", line: "#3a2f26" },
  { value: "system", label: msg("Auto"), icon: Desktop, bg: "linear-gradient(90deg,#f7f0e6 50%,#171310 50%)", card: "linear-gradient(90deg,#fffbf5 50%,#211b16 50%)", bar: "#cdd9c6", line: "#b5a594" },
] as const;

/** Daily email digest: on/off, plus a sample so people see what they would get. */
function EmailCard() {
  const { t } = useT();
  const user = useUser();
  const updateProfile = useAppStore((s) => s.updateProfile);
  const [on, setOn] = React.useState(user.emailDigest);
  const [sending, setSending] = React.useState(false);

  async function toggle() {
    setOn(!on);
    if (!(await updateProfile({ emailDigest: !on }))) setOn(on);
  }
  async function sample() {
    setSending(true);
    try {
      const n = await sendSampleDigest();
      if (n) toast.success(tn(n, "Sent {n} update to {email}", "Sent {n} updates to {email}", { email: user.email }));
      else toast(t("Nothing unread from the last day, so there is nothing to send."));
    } catch {
      toast.error(t("Couldn't send the email. Try again."));
    }
    setSending(false);
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p id="digest-label" className="flex items-center gap-2 text-sm font-bold"><EnvelopeSimple weight="duotone" className="size-4 text-primary" aria-hidden />{t("Daily email")}</p>
          <p className="text-xs text-muted-foreground">{t("Once a morning, anything you haven't read yet.")}</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby="digest-label" onClick={toggle}
          className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-primary" : "bg-muted-foreground/30")}>
          <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
        </button>
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={sample} disabled={sending}>
        {sending ? t("Sending…") : t("Send me a sample")}
      </Button>
    </Card>
  );
}

function ThemeTiles() {
  const { t } = useT();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? theme : "system";
  return (
    <div className="grid grid-cols-3 gap-2.5" role="group" aria-label={t("Theme")}>
      {themes.map((tt) => {
        const active = current === tt.value;
        return (
          <button key={tt.value} type="button" onClick={() => setTheme(tt.value)} aria-pressed={active}
            className={cn("group rounded-2xl border-2 p-1.5 text-left transition-[border-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40", active ? "border-primary shadow-soft" : "border-transparent hover:border-border")}>
            <span className="block overflow-hidden rounded-xl border" style={{ background: tt.bg }} aria-hidden>
              <span className="flex h-16 gap-1 p-1.5">
                <span className="w-2.5 rounded-sm" style={{ background: tt.bar }} />
                <span className="flex flex-1 flex-col gap-1 rounded-md p-1" style={{ background: tt.card }}>
                  <span className="h-1 w-3/4 rounded-full" style={{ background: tt.line }} />
                  <span className="h-1 w-1/2 rounded-full" style={{ background: tt.line }} />
                  <span className="mt-auto h-2 w-1/3 rounded-sm bg-warm" />
                </span>
              </span>
            </span>
            <span className="mt-1.5 flex items-center justify-between px-1 text-xs font-bold">
              <span className="flex items-center gap-1"><tt.icon className="size-3.5" aria-hidden />{t(tt.label)}</span>
              {active && <CheckCircle weight="fill" className="size-4 text-primary" aria-hidden />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The profile photo with a camera button to upload, replace or remove it. */
function AvatarEditor() {
  const { t } = useT();
  const user = useUser();
  const hasPhoto = useAppStore((s) => !!s.avatars[user.id]);
  const setAvatar = useAppStore((s) => s.setAvatar);
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [picked, setPicked] = React.useState<File | null>(null); // waiting in the crop dialog
  const run = async (file: File | null) => {
    setBusy(true);
    const ok = await setAvatar(file);
    if (ok) toast.success(file ? t("Photo updated") : t("Photo removed"));
    setBusy(false);
    return ok;
  };
  const pick = () => input.current?.click();
  const choose = (f: File) => {
    if (!AVATAR_TYPES.includes(f.type)) toast.error(t("Use a PNG, JPG, WebP or GIF image"));
    else setPicked(f);
  };

  return (
    <>
      <PhotoCropDialog file={picked} onCancel={() => setPicked(null)} onSave={run} />
      <Avatar name={user.name} id={user.id} size="xl" className="relative size-24 text-2xl ring-4 ring-background" />
      {busy && <span className="absolute inset-0 grid place-items-center rounded-full bg-scrim/45" aria-hidden><CircleNotch className="size-7 animate-spin text-white" /></span>}
      <input ref={input} type="file" accept={AVATAR_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) choose(f); }} />
      {hasPhoto ? (
        <DropdownMenu>
          <DropdownMenuTrigger disabled={busy} aria-label={t("Change profile photo")}
            className="tap absolute -bottom-0.5 -right-0.5 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lift ring-4 ring-background transition-transform hover:scale-105 disabled:opacity-60">
            <Camera weight="fill" className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onSelect={pick}><UploadSimple className="size-4" aria-hidden />{t("Upload new photo")}</DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => run(null)}><Trash className="size-4" aria-hidden />{t("Remove photo")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button type="button" onClick={pick} disabled={busy} aria-label={t("Upload profile photo")}
          className="tap absolute -bottom-0.5 -right-0.5 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lift ring-4 ring-background transition-transform hover:scale-105 disabled:opacity-60">
          <Camera weight="fill" className="size-4" aria-hidden />
        </button>
      )}
    </>
  );
}

export function ProfilePanel() {
  const { t } = useT();
  const user = useUser();
  const teams = useAppStore((s) => s.teams);
  const alerts = useAppStore((s) => s.conflictAlerts);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const student = user.role === "student";

  const [bio, setBio] = React.useState(user.bio);
  const [skills, setSkills] = React.useState(user.skills);
  const [availability, setAvailability] = React.useState(user.availability);
  const [github, setGithub] = React.useState(user.githubLogin ?? "");
  const [saving, setSaving] = React.useState(false);

  const githubValid = GITHUB_RE.test(github.trim().replace(/^@/, "")) || !github.trim();
  const dirty = bio !== user.bio || availability !== user.availability || skills.join("|") !== user.skills.join("|") || github.trim().replace(/^@/, "") !== (user.githubLogin ?? "");
  // Strength follows the form, so the ring fills as you type.
  const checks = [
    { id: "bio", label: t("Bio"), done: !!bio.trim() },
    { id: "skills", label: t("Skills"), done: skills.length > 0 },
    { id: "availability", label: t("Availability"), done: !!availability.trim() },
  ];
  const complete = checks.filter((c) => c.done).length;
  const students = new Set(teams.flatMap((tt) => tt.members.map((m) => m.userId))).size;
  const openAlerts = alerts.filter((a) => !a.isResolved).length;
  const avgHealth = teams.length ? Math.round(teams.reduce((n, tt) => n + tt.healthScore, 0) / teams.length) : 0;
  const stats = [
    { label: t("Teams"), value: teams.length, icon: UsersThree, tile: "bg-primary/10 text-primary", href: "/instructor" },
    { label: t("Students"), value: students, icon: Student, tile: "bg-info/12 text-info", href: "/instructor" },
    { label: t("Open alerts"), value: openAlerts, icon: Warning, tile: openAlerts ? "bg-destructive/12 text-destructive" : "bg-muted text-muted-foreground", href: "/instructor/conflicts" },
    { label: t("Avg health"), value: avgHealth, icon: Heartbeat, tile: "bg-success/12 text-success", href: "/instructor/analytics" },
  ];

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    if (!githubValid) { jump("github"); return setSaving(false); }
    if (await updateProfile({ bio: bio.trim(), skills, availability: availability.trim(), ...(student ? { githubLogin: github } : {}) })) toast.success(t("Profile saved"));
    setSaving(false);
  }
  const reset = () => { setBio(user.bio); setSkills(user.skills); setAvailability(user.availability); setGithub(user.githubLogin ?? ""); };
  const jump = (id: string) => { const el = document.getElementById(id); el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.focus({ preventScroll: true }); };

  return (
    <Page className="max-w-6xl space-y-8 pb-28">
      {/* ── Hero: identity and profile strength ────────────────────────────────── */}
      <motion.section
        aria-labelledby="profile-title"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
        className="border-b pb-8"
      >

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative flex w-fit shrink-0">
              <span className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-brand to-warm opacity-80" aria-hidden />
              <AvatarEditor />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">{t("Your profile")}</p>
              <h1 id="profile-title" className="mt-1 truncate text-3xl font-extrabold tracking-tight sm:text-4xl">{user.name}</h1>
              <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground"><EnvelopeSimple className="size-4 shrink-0" aria-hidden />{user.email}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-bold capitalize text-primary-foreground"><IdentificationBadge weight="fill" className="size-3.5" aria-hidden />{user.role}</span>
                {student && teams.map((tt) => <span key={tt.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground"><UsersThree weight="fill" className="size-3.5" aria-hidden />{tt.name}</span>)}
                {user.availability && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"><Clock className="size-3.5" aria-hidden />{user.availability}</span>}
                {!student && (
                  <button type="button" onClick={() => jump(checks.find((c) => !c.done)?.id ?? "bio")}
                    className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors", complete === 3 ? "bg-success/12 text-success" : "bg-warm/15 text-warm-text hover:bg-warm/25")}>
                    {complete === 3 ? <CheckCircle weight="fill" className="size-3.5" aria-hidden /> : <Circle weight="bold" className="size-3.5" aria-hidden />}
                    {t("Profile {n}/3 complete", { n: complete })}
                  </button>
                )}
              </div>
            </div>
          </div>

          {student ? (
            <div className="flex items-center gap-5 rounded-2xl border bg-card p-4 pr-6 shadow-soft">
              <ProgressRing value={(complete / 3) * 100} size={84} stroke={8} color={complete === 3 ? "var(--success)" : "var(--warm)"} label={t("Profile strength")}>
                <span className="text-lg font-extrabold tabular-nums">{num(complete)}/{num(3)}</span>
              </ProgressRing>
              <div>
                <p className="text-sm font-bold">{complete === 3 ? t("Ready for matching") : t("Profile strength")}</p>
                <ul className="mt-1.5 space-y-1">
                  {checks.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => jump(c.id)} className="flex min-h-6 items-center gap-1.5 rounded text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
                        {c.done ? <CheckCircle weight="fill" className="size-4 text-success" aria-hidden /> : <Circle className="size-4" aria-hidden />}
                        {c.label}<span className="sr-only">{c.done ? t(", done") : t(", missing. Go to field")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:w-[26rem] lg:w-[24rem]" aria-label={t("Your teaching at a glance")}>
              {stats.map((st) => (
                <li key={st.label}>
                  <Link href={st.href} className="group flex items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-soft transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-lift focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10", st.tile)}><st.icon weight="fill" className="size-5" aria-hidden /></span>
                    <span className="min-w-0">
                      <span className="block truncate whitespace-nowrap text-xs font-semibold text-muted-foreground">{st.label}</span>
                      <span className="block text-2xl font-extrabold leading-tight tabular-nums">{num(st.value)}</span>
                    </span>
                    <ArrowRight className="ml-auto hidden size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Form ──────────────────────────────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="border-b px-5 py-4 sm:px-6">
            <h2 className="text-base font-extrabold">{t("About you")}</h2>
            <p className="text-sm text-muted-foreground">{student ? t("Your skills and availability are what AI team matching uses to place you.") : t("How you appear to your students.")}</p>
          </div>
          <form id="profile-form" onSubmit={save} className="divide-y">
            <Section icon={TextAlignLeft} title={t("Bio")} htmlFor="bio" hint={t("A sentence or two about what you like working on.")}>
              <Textarea id="bio" value={bio} maxLength={2000} rows={4} onChange={(e) => setBio(e.target.value)} aria-describedby="bio-hint"
                placeholder={student ? t("e.g. Third-year CS student. I enjoy frontend work and keeping the team organised.") : t("e.g. I teach software engineering and love seeing teams ship real projects.")} />
              <p className="mt-1.5 text-right text-xs tabular-nums text-muted-foreground">{num(bio.length)}/{num(2000)}</p>
            </Section>

            <Section icon={Lightning} title={t("Skills")} htmlFor="skills" hint={t("Press Enter or comma to add. {count}/{MAX_SKILLS}.", { count: skills.length, MAX_SKILLS })}>
              <SkillsInput skills={skills} onChange={setSkills} />
            </Section>

            <Section icon={Clock} title={t("Availability")} htmlFor="availability" hint={t("When can your team usually count on you?")}>
              <div className="flex flex-wrap gap-2">
                {availabilityIdeas.map((i) => t(i)).map((a) => {
                  const on = availability === a;
                  return (
                    <button key={a} type="button" onClick={() => setAvailability(a)} aria-pressed={on}
                      className={cn("inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors", on ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-input bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground")}>
                      {on && <Check weight="bold" className="size-3.5" aria-hidden />}{a}
                    </button>
                  );
                })}
              </div>
              <Input id="availability" value={availability} maxLength={200} onChange={(e) => setAvailability(e.target.value)} placeholder={t("Or describe it, e.g. Tue/Thu after 6pm")} aria-describedby="availability-hint" className="mt-3" />
            </Section>

            {student && (
              <Section icon={GithubLogo} title={t("GitHub username")} htmlFor="github" hint={t("So commits in your team's linked repository count as yours.")}>
                <Input id="github" value={github} maxLength={40} onChange={(e) => setGithub(e.target.value)} placeholder={t("e.g. octocat")} autoComplete="off" spellCheck={false}
                  aria-describedby="github-hint" aria-invalid={!githubValid || undefined} />
                {!githubValid && <p className="mt-1.5 text-xs font-semibold text-destructive">{t("Letters, numbers and single hyphens, up to 39 characters.")}</p>}
              </Section>
            )}
          </form>
        </Card>

        {/* ── Side: live preview and appearance ─────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card className="overflow-hidden">
            <p className="flex items-center gap-2 border-b px-4 py-3 text-sm font-bold"><Eye weight="duotone" className="size-4 text-primary" aria-hidden />{student ? t("How teammates see you") : t("How students see you")}</p>
            <div className="p-4">
              <div className="rounded-2xl border bg-background/60 p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={user.name} id={user.id} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{user.name}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Clock className="size-3 shrink-0" aria-hidden />{availability.trim() || t("Availability not set")}</p>
                  </div>
                </div>
                <p className={cn("mt-3 line-clamp-4 text-sm leading-relaxed", !bio.trim() && "italic text-muted-foreground")}>{bio.trim() || t("No bio yet.")}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {skills.length ? skills.slice(0, 8).map((s) => <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground">{s}</span>)
                    : <span className="text-xs italic text-muted-foreground">{t("No skills listed.")}</span>}
                  {skills.length > 8 && <span className="px-1 text-[0.6875rem] text-muted-foreground">+{num(skills.length - 8)}</span>}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("Updates as you type. Save to share it.")}</p>
            </div>
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-2 text-sm font-bold"><Palette weight="duotone" className="size-4 text-primary" aria-hidden />{t("Appearance")}</p>
            <p className="mb-3 text-xs text-muted-foreground">{t("Saved on this device.")}</p>
            <ThemeTiles />
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-2 text-sm font-bold"><Translate weight="duotone" className="size-4 text-primary" aria-hidden />{t("Language")}</p>
            <p className="mb-3 text-xs text-muted-foreground">{t("For the app and your emails.")}</p>
            <LanguageSwitch />
          </Card>

          <EmailCard />
          <AlertsCard />
          <MyDataCard />
        </aside>
      </div>

      {/* ── Save bar: only while there are unsaved changes ───────────────────────── */}
      <AnimatePresence>
        {dirty && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.25, ease: EASE }}
            className="sticky bottom-4 z-30" role="status">
            <div className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl border bg-card/95 p-2.5 pl-4 shadow-lift backdrop-blur">
              <span className="relative flex size-2.5 shrink-0"><span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-warm" /><span className="relative size-2.5 rounded-full bg-warm" /></span>
              <p className="min-w-0 flex-1 text-sm font-semibold">{t("Unsaved changes")}</p>
              <Button type="button" variant="ghost" disabled={saving} onClick={reset}><ArrowCounterClockwise aria-hidden /> <span className="hidden sm:inline">{t("Reset")}</span></Button>
              <Button type="submit" form="profile-form" loading={saving}>{!saving && <FloppyDisk weight="fill" aria-hidden />} {t("Save")}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}
