"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  cubicBezier,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  GraduationCap,
  KanbanSquare,
  MessageSquare,
  Shield,
  Sparkles,
  Users,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { MenuToggle } from "@/components/menu-toggle";

const ease = [0.22, 1, 0.36, 1] as const;
const easeFn = cubicBezier(...ease);

const navLinks = [
  { href: "#students", label: "For students" },
  { href: "#faculty", label: "For faculty" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

/* ---------- shared bits ---------- */

// Sections rise 32px and fade in once when they enter the viewport (B7).
function Reveal({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      id={id}
      className={cn("scroll-mt-24", className)}
      initial={{ opacity: 0, y: reduce ? 0 : 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, ease }}
    >
      {children}
    </motion.section>
  );
}

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="w-8 h-8 rounded-lg bg-brand text-brand-foreground flex items-center justify-center">
        <GraduationCap className="w-5 h-5" />
      </span>
      <span className="title-3">CampusNova</span>
    </span>
  );
}

/* ---------- nav ---------- */

function Nav({ onSignIn }: { onSignIn: () => void }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header className="fixed top-4 inset-x-0 z-50 flex justify-center px-4">
        <nav
          aria-label="Main"
          className="flex items-center gap-2 rounded-2xl border border-border bg-background/70 backdrop-blur-md p-2 pl-4 shadow-sm"
        >
          <a href="#top" className="rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <Logo />
          </a>
          <ul className="hidden md:flex items-center gap-1 mx-4">
            {navLinks.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="block rounded-lg px-3 py-2 body-5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="hidden md:inline-flex rounded-lg" onClick={onSignIn}>
            Sign in
          </Button>
          <MenuToggle open={open} onToggle={() => setOpen(!open)} controls="mobile-menu" className="md:hidden ml-4" />
        </nav>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            className="fixed inset-0 z-40 bg-background/95 backdrop-blur-xl md:hidden flex flex-col justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            <ul className="space-y-2">
              {[...navLinks, { href: "#signin", label: "Sign in" }].map((l, i) => (
                <motion.li
                  key={l.href}
                  initial={{ opacity: 0, y: reduce ? 0 : 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease, delay: Math.min(i * 0.06, 0.4) }}
                >
                  <a
                    href={l.href}
                    onClick={(e) => {
                      setOpen(false);
                      if (l.href === "#signin") {
                        e.preventDefault();
                        onSignIn();
                      }
                    }}
                    className="block rounded-lg py-3 heading-5 hover:text-muted-foreground transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {l.label}
                  </a>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ---------- hero preview (sample data for the demo only) ---------- */

const board = [
  { col: "To do", cards: [{ t: "Draft survey questions", who: "Amina R.", due: "Mar 14" }] },
  {
    col: "In progress",
    cards: [
      { t: "Clean interview transcripts", who: "Tomás V.", due: "Mar 11" },
      { t: "Literature review section", who: "Priya N.", due: "Mar 17" },
    ],
  },
  { col: "Done", cards: [{ t: "Pick research question", who: "Jonah K.", due: "Mar 3" }] },
];

const teamsHealth = [
  { name: "Team Halcyon", score: 87, tasks: "14 of 19 tasks done" },
  { name: "Team Ferris", score: 58, tasks: "6 of 17 tasks done", alert: true },
  { name: "Team Quill", score: 92, tasks: "16 of 18 tasks done" },
];

function StudentPreview() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {board.map((c, i) => (
          <div key={c.col} className={cn("rounded-lg bg-muted p-2 space-y-2", i === 2 && "hidden sm:block")}>
            <p className="caption-3 text-muted-foreground px-1">{c.col}</p>
            {c.cards.map((card) => (
              <div
                key={card.t}
                className="rounded-md border border-border bg-card p-2 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5"
              >
                <p className="caption-1 text-foreground">{card.t}</p>
                <p className="caption-5 text-muted-foreground mt-1">
                  {card.who} · {card.due}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-3 flex items-start gap-3">
        <Sparkles className="w-4 h-4 mt-0.5 text-chart-2 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="caption-1">Suggested from chat: “Book the lab for Thursday”</p>
          <p className="caption-5 text-muted-foreground">Jonah mentioned it at 4:12 pm</p>
        </div>
        <Badge variant="secondary" className="shrink-0">Add task</Badge>
      </div>
    </div>
  );
}

function FacultyPreview() {
  return (
    <ul className="space-y-2">
      {teamsHealth.map((t) => (
        <li key={t.name} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="caption-1 flex items-center gap-2">
              {t.name}
              {t.alert && (
                <span className="inline-flex items-center gap-1 caption-4 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3" /> Needs a check in
                </span>
              )}
            </p>
            <p className="caption-5 text-muted-foreground">{t.tasks}</p>
          </div>
          <div className="w-24 h-2 rounded-full bg-muted overflow-hidden" aria-hidden>
            <div
              className={cn("h-full rounded-full", t.score >= 80 ? "bg-chart-2" : t.score >= 60 ? "bg-chart-4" : "bg-chart-5")}
              style={{ width: `${t.score}%` }}
            />
          </div>
          <span className="caption-3 w-8 text-right">{t.score}</span>
        </li>
      ))}
    </ul>
  );
}

function HeroPreview() {
  const [role, setRole] = useState<"student" | "faculty">("student");
  return (
    <div className="rounded-2xl border border-border bg-background p-2 shadow-sm">
      <div className="rounded-xl bg-muted/50 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="title-4">{role === "student" ? "Research methods · Team Quill" : "Research methods · 3 teams"}</p>
          <div role="tablist" aria-label="Preview as" className="inline-flex rounded-lg bg-muted p-1">
            {(["student", "faculty"] as const).map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={role === r}
                onClick={() => setRole(r)}
                className={cn(
                  "min-h-9 rounded-md px-3 button-xsm transition-[color,background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  role === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r === "student" ? "Student view" : "Faculty view"}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={role}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease }}
          >
            {role === "student" ? <StudentPreview /> : <FacultyPreview />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------- tagline reveal (B11) ---------- */

function Word({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.3, 1], { ease: easeFn });
  return <motion.span style={{ opacity }}>{word} </motion.span>;
}

function TaglineReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const lines = ["Less chasing teammates.", "More time on the work that gets graded."];
  const words = lines.flatMap((l, li) => l.split(" ").map((w) => ({ w, li })));

  return (
    <section aria-label="Why CampusNova" className="py-24 sm:py-32">
      <div ref={ref} className="mx-auto max-w-[680px] px-6">
        <p className="heading-4 sm:heading-2">
          {reduce
            ? lines.map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))
            : lines.map((l, li) => (
                <span key={l} className="block">
                  {words.map((item, i) =>
                    item.li === li ? (
                      <Word key={i} word={item.w} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} />
                    ) : null
                  )}
                </span>
              ))}
        </p>
      </div>
    </section>
  );
}

/* ---------- page ---------- */

const studentBenefits = [
  { icon: KanbanSquare, title: "Know who owns what", body: "Every task on the team board has an owner and a due date, so nobody has to ask twice." },
  { icon: Sparkles, title: "Keep the to do list out of chat", body: "When your team agrees on work in chat, CampusNova suggests it as a task. One click adds it to the board." },
  { icon: Shield, title: "Give honest feedback safely", body: "Peer reviews are anonymous, so you can rate a teammate fairly without the awkward conversation." },
];

const facultyBenefits = [
  { icon: BrainCircuit, title: "Form balanced teams from one screen", body: "Matching compares the skills and availability students list on their profiles, then proposes teams you review before creating." },
  { icon: AlertTriangle, title: "See trouble before the deadline", body: "Each night every team's chat is checked for tone and its health score is updated. Teams that slip raise a conflict alert." },
  { icon: BarChart3, title: "Grade contribution with evidence", body: "Analytics show tasks completed and messages sent by each student, so participation marks rest on more than a hunch." },
];

const steps = [
  { title: "Create your account", body: "Sign up with your university email and add your skills and availability to your profile." },
  { title: "Get your team", body: "Your instructor matches teams across the class, or places you directly. Your team space opens right away." },
  { title: "Plan, talk and deliver", body: "Use the board, chat and shared files together. Rate your teammates when the project wraps up." },
];

const faqs = [
  { q: "How are teams formed?", a: "An instructor runs matching for the course. It compares the skills and availability students list on their profiles and proposes balanced teams. The instructor reviews the proposal before any team is created." },
  { q: "Where do suggested tasks come from?", a: "After your team chats about work, CampusNova reads the recent messages and suggests tasks. Suggestions appear a couple of minutes later, and nothing reaches the board until someone on the team accepts it." },
  { q: "Are peer reviews anonymous?", a: "Yes. Teammates see the feedback without your name attached." },
  { q: "What does the team health score mean?", a: "Once a day each team's recent chat is checked for tone. The score helps instructors spot teams that may need a conversation. It is a prompt to check in, not a grade." },
  { q: "How do faculty get instructor access?", a: "Choose Instructor when you create your account. An administrator approves instructor access, and until then the account opens the student workspace." },
  { q: "Can my team share files?", a: "Yes. Upload files to your team's file space and everyone on the team can download them." },
];

function Benefits({ id, eyebrow, title, items, icon: Icon }: { id: string; eyebrow: string; title: string; items: typeof studentBenefits; icon: typeof BookOpen }) {
  return (
    <Reveal id={id} className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <p className="caption-3 uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
          <Icon className="w-4 h-4" /> {eyebrow}
        </p>
        <h2 className="heading-4 sm:heading-3 max-w-[680px] mb-12">{title}</h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {items.map((b) => (
            <li
              key={b.title}
              className="group rounded-2xl border border-border bg-card p-6 transition-[transform,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-foreground/20"
            >
              <span className="mb-6 inline-flex size-10 items-center justify-center rounded-lg bg-brand text-brand-foreground transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105">
                <b.icon className="w-5 h-5" />
              </span>
              <h3 className="title-2 mb-2">{b.title}</h3>
              <p className="body-6 text-muted-foreground">{b.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

export function LandingPage() {
  const setView = useAppStore((s) => s.setView);
  const reduce = useReducedMotion();
  const signIn = () => setView("login");
  const signUp = () => setView("register");

  return (
    <div id="top" className="min-h-screen bg-background">
      <Nav onSignIn={signIn} />

      <main id="main">
        {/* Hero */}
        <section className="pt-32 pb-16 sm:pt-40 sm:pb-24">
          <div className="mx-auto max-w-6xl px-6 grid gap-12 lg:grid-cols-2 lg:items-center">
            <motion.div
              initial={{ opacity: 0, y: reduce ? 0 : 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease }}
            >
              <Badge variant="secondary" className="mb-6 gap-2 caption-4">
                <Users className="w-3 h-3" /> For students and faculty
              </Badge>
              <h1 className="text-hero heading-3 sm:heading-2 max-w-[680px] pb-2">
                One workspace for
                <br />
                every group project
              </h1>
              <p className="body-3 sm:title-1 text-muted-foreground max-w-[680px] mt-6">
                Students plan tasks, chat and share files with their team.
                Faculty see how every team is doing and step in early.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center">
                <Button size="lg" className="button-md gap-2" onClick={signUp}>
                  Create your account
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <button
                  type="button"
                  onClick={signIn}
                  className="min-h-11 rounded-md px-3 body-5 text-muted-foreground hover:text-foreground transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  I already have an account
                </button>
              </div>
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 caption-2 text-muted-foreground">
                {["Teams matched by skills", "Anonymous peer reviews", "Daily team health check"].map((p) => (
                  <li key={p} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-chart-2" /> {p}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: reduce ? 0 : 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.15 }}
            >
              <HeroPreview />
            </motion.div>
          </div>
        </section>

        <Benefits id="students" eyebrow="For students" icon={BookOpen} title="Spend group project time on the project" items={studentBenefits} />

        <TaglineReveal />

        <Benefits id="faculty" eyebrow="For faculty" icon={GraduationCap} title="Run a class of teams without guessing who is stuck" items={facultyBenefits} />

        {/* How it works */}
        <Reveal id="how" className="py-16 sm:py-24 bg-muted/50">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="heading-4 sm:heading-3 mb-12">How it works</h2>
            <ol className="grid gap-8 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title}>
                  <span className="mb-4 inline-flex size-10 items-center justify-center rounded-full border border-border bg-background title-3">
                    {i + 1}
                  </span>
                  <h3 className="title-2 mb-2">{s.title}</h3>
                  <p className="body-6 text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>

        {/* FAQ */}
        <Reveal id="faq" className="py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="heading-4 sm:heading-3 mb-8">Questions students and faculty ask</h2>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((f) => (
                <AccordionItem key={f.q} value={f.q}>
                  <AccordionTrigger className="title-3 py-4">{f.q}</AccordionTrigger>
                  <AccordionContent className="body-6 text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Reveal>

        {/* Final CTA */}
        <Reveal className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="rounded-2xl bg-primary text-primary-foreground px-6 py-16 sm:px-12 text-center">
              <MessageSquare className="w-8 h-8 mx-auto mb-6 text-brand" />
              <h2 className="heading-4 sm:heading-3 max-w-[680px] mx-auto">
                Start your next group project
                <br />
                on the same page
              </h2>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" className="button-md gap-2 bg-brand text-brand-foreground hover:bg-brand/90" onClick={signUp}>
                  Create your account
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <Logo />
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {navLinks.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="caption-2 text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  );
}
