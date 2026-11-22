"use client";

import Link from "next/link";
import { Compass } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale";

export default function NotFound() {
  const { t } = useT();
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="pointer-events-none absolute inset-0 bg-dots opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden />
      <Logo className="relative mb-10" />
      <span className="relative mb-6 flex size-16 items-center justify-center rounded-3xl bg-secondary text-primary">
        <Compass weight="duotone" className="size-8" aria-hidden />
      </span>
      <p className="relative text-sm font-bold uppercase tracking-[0.14em] text-warm-text">{t("Page not found")}</p>
      <h1 className="relative mt-2 text-3xl font-extrabold sm:text-4xl">{t("This page isn't part of any project")}</h1>
      <p className="relative mt-3 max-w-md text-muted-foreground">{t("The link may be old or mistyped. Your teams, tasks and files are all still in your workspace.")}</p>
      <Button asChild size="lg" className="relative mt-8">
        <Link href="/">{t("Back to ScholarSync")}</Link>
      </Button>
    </main>
  );
}
