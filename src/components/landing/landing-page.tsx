"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import {
  ArrowRight, Bell, ChalkboardTeacher, ChartLineUp, ChatsCircle, Check, CheckCircle, FolderOpen, Kanban, LockKey, Moon, ShieldCheck,
  Sparkle, Star, Student, Sun, UsersThree, Warning,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/app/page";
import { ProductDemo } from "@/components/landing/product-demo";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EASE, Reveal, Spotlight, Stagger, StaggerItem } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { useMounted } from "@/hooks/use-client";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={dark ? "sun" : "moon"} initial={{ rotate: -60, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 60, opacity: 0 }} transition={{ duration: 0.18 }}>
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

function Header() {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={cn("fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,box-shadow] duration-300", scrolled ? "border-b bg-background/85 shadow-soft backdrop-blur-xl" : "border-b border-transparent")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="rounded-xl" aria-label="ScholarSync home"><Logo /></Link>
        <nav aria-label="Sections" className="ml-8 hidden items-center gap-1 md:flex">
          {[["Features", "#features"], ["Who it's for", "#audience"], ["How it works", "#how"]].map(([label, href]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{label}</a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link href="/login">Sign in</Link></Button>
          <Button asChild><Link href="/register">Get started</Link></Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pb-24 sm:pt-36">
      {/* Atmosphere: two slow colour fields and a dot grid, all decorative */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-40 left-1/2 size-[44rem] -translate-x-[70%] animate-drift rounded-full bg-primary/20 blur-[110px]" />
        <div className="absolute -top-24 left-1/2 size-[34rem] translate-x-[10%] animate-drift rounded-full bg-warm/20 blur-[110px] [animation-delay:-8s]" />
        <div className="absolute inset-0 bg-dots opacity-60 [mask-image:radial-gradient(ellipse_70%_55%_at_50%_30%,black,transparent)]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            <Link href="/register" className="group inline-flex items-center gap-2 rounded-full border bg-card/80 py-1 pl-1 pr-3 text-sm font-semibold shadow-soft backdrop-blur transition-[border-color,box-shadow] hover:border-warm/60 hover:shadow-lift">
              <span className="inline-flex items-center gap-1 rounded-full bg-warm px-2 py-0.5 text-xs font-extrabold text-warm-foreground"><Sparkle weight="fill" className="size-3" aria-hidden /> AI</span>
              Tasks pulled straight out of your team chat
              <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.08, ease: EASE }}
            className="mt-6 text-[2.6rem] font-extrabold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
            Group projects that <span className="text-gradient">actually work.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.16, ease: EASE }}
            className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            ScholarSync gives every university team one place to chat, plan and share files, and gives faculty a clear view of who is doing the work.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.24, ease: EASE }} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="group w-full sm:w-auto">
              <Link href="/register">Create your account <ArrowRight className="transition-transform group-hover:translate-x-1" aria-hidden /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto"><Link href="/login">I already have one</Link></Button>
          </motion.div>

          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.4 }} className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {["Real-time chat and board", "Private peer reviews", "Works on your phone"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5"><CheckCircle weight="fill" className="size-4 text-primary" aria-hidden />{t}</li>
            ))}
          </motion.ul>
        </div>

        <motion.div initial={{ opacity: 0, y: 48, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, delay: 0.3, ease: EASE }} className="relative mx-auto mt-14 max-w-4xl">
          <div className="pointer-events-none absolute -inset-x-10 -bottom-8 top-10 rounded-[3rem] bg-gradient-to-b from-primary/20 to-transparent blur-3xl" aria-hidden />
          <div className="relative"><ProductDemo /></div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Features ────────────────────────────────────────────────────────────

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-warm-text">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-extrabold sm:text-[2.5rem] sm:leading-[1.1]">{title}</h2>
      <p className="mt-3 text-lg text-muted-foreground">{body}</p>
    </Reveal>
  );
}

// Each feature gets its own pastel, like the stat cards inside the app.
const featureTones = {
  peach: { card: "bg-peach", tile: "bg-peach-strong" },
  sage: { card: "bg-sage", tile: "bg-sage-strong" },
  butter: { card: "bg-butter", tile: "bg-butter-strong" },
  sky: { card: "bg-sky", tile: "bg-sky-strong" },
  rose: { card: "bg-rose", tile: "bg-rose-strong" },
} as const;

function FeatureCard({ icon: IconCmp, title, body, className, children, tone }: { icon: Icon; title: string; body: string; className?: string; children?: React.ReactNode; tone: keyof typeof featureTones }) {
  return (
    <StaggerItem className={className}>
      <Spotlight className={cn("group flex h-full flex-col overflow-hidden rounded-3xl p-6 shadow-soft transition-[transform,box-shadow] duration-300 ease-out-expo hover:-translate-y-1 hover:shadow-lift", featureTones[tone].card)}>
        <span className={cn("relative flex size-11 items-center justify-center rounded-2xl text-white shadow-soft transition-transform duration-300 ease-out-expo group-hover:scale-110 group-hover:-rotate-6", featureTones[tone].tile)}>
          <IconCmp weight="fill" className="size-6" aria-hidden />
        </span>
        <h3 className="relative mt-4 text-xl font-extrabold">{title}</h3>
        <p className="relative mt-1.5 text-muted-foreground">{body}</p>
        {children && <div className="relative mt-5 flex-1" aria-hidden>{children}</div>}
      </Spotlight>
    </StaggerItem>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading eyebrow="Everything in one place" title="Stop juggling five apps for one assignment" body="Chat, tasks, files and feedback live together, so nothing falls through the cracks the night before the deadline." />

        <Stagger inView className="mt-12 grid gap-4 md:grid-cols-6">
          <FeatureCard className="md:col-span-4" icon={Sparkle} tone="peach" title="AI turns talk into tasks" body={`Someone writes "I'll do the slides by Friday". ScholarSync suggests it as a task. You tap once to add it to the board.`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex-1 rounded-2xl rounded-bl-md bg-glass-strong px-4 py-3 text-sm"><span className="font-bold">Sara:</span> I'll do the slides by Friday.</div>
              <ArrowRight className="mx-auto size-5 shrink-0 rotate-90 text-warm-text transition-transform duration-300 group-hover:translate-y-1 sm:rotate-0 sm:group-hover:translate-x-1 sm:group-hover:translate-y-0" />
              <div className="flex flex-1 items-center gap-2.5 rounded-2xl bg-glass-strong px-4 py-3 text-sm font-bold"><Sparkle weight="fill" className="size-4 shrink-0 text-warm-text" /> Prepare slides · Fri</div>
            </div>
          </FeatureCard>

          <FeatureCard className="md:col-span-2" icon={Kanban} tone="sage" title="A board everyone trusts" body="Drag a card and the whole team sees it move, live.">
            <div className="flex gap-2">
              {["To do", "Doing", "Done"].map((c, i) => (
                <div key={c} className="flex-1 rounded-xl bg-glass p-2">
                  <p className="text-[0.625rem] font-bold text-muted-foreground">{c}</p>
                  {Array.from({ length: 3 - i }, (_, j) => <div key={j} className={cn("mt-1.5 h-4 rounded-md bg-card shadow-soft transition-transform duration-300", i === 1 && j === 0 && "group-hover:translate-x-1 group-hover:-rotate-3")} />)}
                </div>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard className="md:col-span-2" icon={ChatsCircle} tone="sky" title="Team chat, with files" body="Messages arrive instantly. Attach a draft and it lands in the shared files too.">
            <div className="space-y-1.5 text-xs">
              <div className="w-fit rounded-2xl rounded-bl-md bg-glass-strong px-3 py-1.5">Draft is up, take a look</div>
              <div className="ml-auto w-fit rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-primary-foreground transition-transform duration-300 ease-out-expo group-hover:-translate-y-0.5">On it!</div>
            </div>
          </FeatureCard>
          <FeatureCard className="md:col-span-2" icon={LockKey} tone="butter" title="Honest peer reviews" body="Rate teammates on five areas. Only your instructor reads them, so people tell the truth.">
            <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <Star key={n} weight="fill" className={cn("size-6 transition-transform duration-300", n <= 4 ? "text-butter-strong" : "text-foreground/15")} style={{ transitionDelay: `${n * 40}ms` }} />)}</div>
          </FeatureCard>
          <FeatureCard className="md:col-span-2" icon={FolderOpen} tone="rose" title="One home for files" body="The brief, the drafts, the final deck. Same version for everyone.">
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
              {["brief.pdf", "slides.pptx", "report.docx"].map((f, i) => (
                <span key={f} className="rounded-lg bg-glass-strong px-2.5 py-1.5 transition-transform duration-300 ease-out-expo group-hover:-translate-y-0.5" style={{ transitionDelay: `${i * 50}ms` }}>{f}</span>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard className="md:col-span-3" icon={ChartLineUp} tone="sage" title="See who is doing the work" body="Progress and each member's share of completed tasks, calculated from the board. No self-reporting.">
            <div className="space-y-2.5">
              {[["Masud", 46], ["Nazmul", 38], ["Chinmoy", 16]].map(([n, v], i) => (
                <div key={n as string} className="flex items-center gap-2.5 text-xs font-semibold">
                  <Avatar name={n as string} size="xs" />
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-glass-strong"><div className="h-full origin-left scale-x-90 rounded-full bg-chart-1 transition-transform duration-700 ease-out-expo group-hover:scale-x-100" style={{ width: `${v}%`, transitionDelay: `${i * 60}ms` }} /></div>
                  <span className="w-8 text-right tabular-nums text-muted-foreground">{v}%</span>
                </div>
              ))}
            </div>
          </FeatureCard>
          <FeatureCard className="md:col-span-3" icon={ShieldCheck} tone="peach" title="Catch trouble early" body="A nightly check reads each team's tone and flags friction or silence to the instructor, before it becomes a failed project.">
            <div className="flex items-center gap-3 rounded-2xl bg-glass-strong px-4 py-3 text-sm">
              <Warning weight="fill" className="size-5 shrink-0 text-warning" />
              <span><strong className="font-bold">Team Orbit</strong> <span className="text-muted-foreground">· one member is waiting on requirements</span></span>
            </div>
          </FeatureCard>
        </Stagger>
      </div>
    </section>
  );
}

// ─── Audience ────────────────────────────────────────────────────────────

const audiences = {
  students: {
    icon: Student,
    title: "For students: less chasing, more doing",
    body: "Open ScholarSync and you know what is yours, what is due and what the team said while you were in class.",
    points: [
      { icon: Kanban, t: "Your tasks, sorted by due date", d: "The dashboard leads with what you owe the team this week." },
      { icon: Sparkle, t: "No more \"who was doing that?\"", d: "AI suggests tasks from chat so commitments don't get lost." },
      { icon: Bell, t: "Nudges that matter", d: "A notification when you're assigned something or reviewed." },
      { icon: LockKey, t: "Feedback without the drama", d: "Peer reviews are private to your instructor." },
    ],
    cta: { label: "Join your team", href: "/register" },
  },
  faculty: {
    icon: ChalkboardTeacher,
    title: "For faculty: every team, at a glance",
    body: "Form balanced teams in seconds, then see progress, contribution and early warning signs without reading every chat.",
    points: [
      { icon: UsersThree, t: "AI team matching", d: "Groups students by complementary skills and overlapping availability. You approve." },
      { icon: ChartLineUp, t: "Progress you can trust", d: "Computed from each team's board, not from status reports." },
      { icon: ShieldCheck, t: "Conflict alerts", d: "Tense or silent teams are flagged with a short summary." },
      { icon: Star, t: "Peer reviews in one place", d: "Read every student's review of their teammates." },
    ],
    cta: { label: "Sign in as faculty", href: "/login" },
  },
} as const;

function Audience() {
  const [who, setWho] = React.useState<keyof typeof audiences>("students");
  const a = audiences[who];
  return (
    <section id="audience" className="scroll-mt-20 border-y bg-card/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading eyebrow="Who it's for" title="Two views of the same project" body="Students get a workspace. Faculty get the overview. Both see only what they should." />
        <Reveal className="mt-8 flex justify-center">
          <Segmented label="Audience" value={who} onChange={setWho} options={[
            { value: "students", label: <><Student aria-hidden className="size-4" />Students</> },
            { value: "faculty", label: <><ChalkboardTeacher aria-hidden className="size-4" />Faculty</> },
          ]} />
        </Reveal>

        <AnimatePresence mode="wait">
          <motion.div key={who} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }}
            className="mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><a.icon weight="duotone" className="size-6" aria-hidden /></span>
              <h3 className="mt-5 text-2xl font-extrabold sm:text-3xl">{a.title}</h3>
              <p className="mt-3 text-lg text-muted-foreground">{a.body}</p>
              <Button asChild size="lg" className="group mt-6"><Link href={a.cta.href}>{a.cta.label} <ArrowRight className="transition-transform group-hover:translate-x-1" aria-hidden /></Link></Button>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {a.points.map((p, i) => (
                <motion.li key={p.t} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 * i, ease: EASE }}
                  className="rounded-2xl border bg-card p-5 shadow-soft transition-[transform,box-shadow,border-color] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift">
                  <p.icon weight="duotone" className="size-6 text-primary" aria-hidden />
                  <p className="mt-3 font-bold">{p.t}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{p.d}</p>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

// ─── How it works ────────────────────────────────────────────────────────

const howSteps = [
  { icon: UsersThree, title: "Get placed on a team", body: "Fill in your skills and availability. Your instructor forms teams, with AI balancing the mix." },
  { icon: ChatsCircle, title: "Plan it out in chat", body: "Agree who does what. Suggested tasks appear as you talk, ready to add to the board." },
  { icon: Check, title: "Ship it together", body: "Move cards to done, share files, review each other. Everyone can see the finish line." },
];

function How() {
  return (
    <section id="how" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading eyebrow="How it works" title="From first meeting to final submission" body="Three steps. No training session required." />
        <Stagger inView className="relative mt-12 grid gap-6 md:grid-cols-3">
          <div className="pointer-events-none absolute left-[16.6%] right-[16.6%] top-7 hidden h-px bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0 md:block" aria-hidden />
          {howSteps.map((s, i) => (
            <StaggerItem key={s.title} className="relative text-center">
              <span className="relative mx-auto flex size-14 items-center justify-center rounded-2xl border bg-card text-primary shadow-soft">
                <s.icon weight="duotone" className="size-7" aria-hidden />
                <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-warm text-xs font-extrabold text-warm-foreground">{i + 1}</span>
              </span>
              <h3 className="mt-5 text-xl font-extrabold">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-muted-foreground">{s.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-4 pb-16 sm:px-6 sm:pb-24">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-sage px-6 py-14 text-center text-foreground sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute -left-24 -top-24 size-80 animate-drift rounded-full bg-peach-strong/40 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -right-16 size-96 animate-drift rounded-full bg-warm/25 blur-3xl [animation-delay:-9s]" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-25" aria-hidden />
        <h2 className="relative mx-auto max-w-2xl text-3xl font-extrabold sm:text-5xl sm:leading-[1.08]">Your next group project can be the easy one.</h2>
        <p className="relative mx-auto mt-4 max-w-lg text-lg text-muted-foreground">Set up takes a minute. Your team's chat, board and files are waiting.</p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" variant="warm" className="group w-full sm:w-auto"><Link href="/register">Get started <ArrowRight className="transition-transform group-hover:translate-x-1" aria-hidden /></Link></Button>
          <Button asChild size="lg" variant="ghost" className="w-full bg-glass hover:bg-glass-strong sm:w-auto"><Link href="/login">Sign in</Link></Button>
        </div>
      </Reveal>
    </section>
  );
}

export function LandingPage() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26 });
  return (
    <div className="relative">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground">Skip to content</a>
      <motion.div className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-ring to-warm" style={{ scaleX: progress }} aria-hidden />
      <Header />
      <main id="content">
        <Hero />
        <Features />
        <Audience />
        <How />
        <FinalCta />
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo />
          <p>A collaboration hub for university group projects.</p>
          <nav aria-label="Footer" className="flex gap-4 font-semibold">
            <Link href="/login" className="rounded hover:text-foreground">Sign in</Link>
            <Link href="/register" className="rounded hover:text-foreground">Create account</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
