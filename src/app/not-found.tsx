import Link from "next/link";
import { Compass } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/app/page";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="pointer-events-none absolute inset-0 bg-dots opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden />
      <Logo className="relative mb-10" />
      <span className="relative mb-6 flex size-16 items-center justify-center rounded-3xl bg-secondary text-primary">
        <Compass weight="duotone" className="size-8" aria-hidden />
      </span>
      <p className="relative text-sm font-bold uppercase tracking-[0.14em] text-warm-text">Page not found</p>
      <h1 className="relative mt-2 text-3xl font-extrabold sm:text-4xl">This page isn't part of any project</h1>
      <p className="relative mt-3 max-w-md text-muted-foreground">The link may be old or mistyped. Your teams, tasks and files are all still in your workspace.</p>
      <Button asChild size="lg" className="relative mt-8">
        <Link href="/">Back to CampusNova</Link>
      </Button>
    </main>
  );
}
