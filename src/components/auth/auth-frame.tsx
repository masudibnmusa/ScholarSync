import Link from "next/link";
import { ArrowLeft, ChatsCircle, CheckCircle, Kanban, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/app/page";
import { Avatar } from "@/components/ui/avatar";

const points = [
  { icon: ChatsCircle, title: "One place to talk", body: "Team chat with files, in real time." },
  { icon: Kanban, title: "A board everyone trusts", body: "Drag tasks from to-do to done." },
  { icon: Sparkle, title: "AI that does the admin", body: "Tasks are pulled out of your chat for you." },
];

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="rounded-xl" aria-label="ScholarSync home"><Logo /></Link>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden /> Home
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[26rem]">{children}</div>
        </div>
        <p className="text-center text-xs text-muted-foreground">Built for students and faculty. Your team's data stays with your team.</p>
      </main>

      <aside className="relative hidden overflow-hidden bg-peach text-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -right-32 -top-32 size-[28rem] animate-drift rounded-full bg-brand/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 -left-20 size-[26rem] animate-drift rounded-full bg-warm/20 blur-3xl [animation-delay:-6s]" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-20" aria-hidden />

        <div className="relative max-w-md">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-brand">Group projects, minus the chaos</p>
          <h2 className="mt-3 text-4xl font-extrabold leading-[1.1]">Everyone knows what to do next.</h2>
        </div>

        {/* A small composed preview of the product, not a screenshot */}
        <div className="relative mx-auto my-10 w-full max-w-md" aria-hidden>
          <div className="animate-float rounded-3xl border border-glass-border bg-glass p-5 shadow-lift backdrop-blur-md">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Team Nova</p>
              <span className="rounded-full bg-brand/20 px-2.5 py-0.5 text-xs font-bold text-brand">68% done</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-glass">
              <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-brand to-peach-strong" />
            </div>
            <ul className="mt-4 space-y-2.5">
              {[["Design database schema", true, "Nazmul Hasan"], ["Build event list page", false, "Masud Musa"], ["Write integration tests", false, "Chinmoy Kumar"]].map(([t, done, who]) => (
                <li key={t as string} className="flex items-center gap-3 rounded-xl bg-glass px-3 py-2.5">
                  <CheckCircle weight={done ? "fill" : "regular"} className={done ? "size-5 text-brand" : "size-5 text-muted-foreground"} />
                  <span className={done ? "flex-1 text-sm text-muted-foreground line-through" : "flex-1 text-sm font-medium"}>{t}</span>
                  <Avatar name={who as string} size="xs" />
                </li>
              ))}
            </ul>
          </div>
          <div className="absolute -bottom-6 -right-4 flex animate-float items-center gap-2.5 rounded-2xl bg-warm px-4 py-3 text-warm-foreground shadow-lift [animation-delay:-3s]">
            <Sparkle weight="fill" className="size-5" />
            <p className="text-sm font-bold">AI found 2 tasks in chat</p>
          </div>
        </div>

        <ul className="relative grid gap-4">
          {points.map((p) => (
            <li key={p.title} className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-glass text-brand">
                <p.icon weight="duotone" className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-bold">{p.title}</p>
                <p className="text-sm text-muted-foreground">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
