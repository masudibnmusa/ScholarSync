"use client";

import * as React from "react";
import type { Icon } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

/** Standard page frame. `fill` makes the page exactly as tall as the viewport area (chat, board). */
export function Page({ fill, className, children }: { fill?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8", fill ? "flex h-full min-h-0 flex-col gap-5" : "space-y-6", className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground sm:text-[0.9375rem]">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

const tones = {
  primary: "bg-primary/10 text-primary",
  warm: "bg-warm/15 text-warm-text",
  info: "bg-info/12 text-info",
  success: "bg-success/12 text-success",
  danger: "bg-destructive/12 text-destructive",
} as const;

export function StatCard({
  icon: IconCmp, label, value, suffix, hint, tone = "primary", compact,
}: { icon: Icon; label: string; value: number; suffix?: string; hint?: React.ReactNode; tone?: keyof typeof tones; compact?: boolean }) {
  return (
    <Card interactive className={cn("h-full", compact ? "p-4 sm:p-5" : "p-5")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn("size-9 shrink-0 items-center justify-center rounded-xl", compact ? "hidden sm:flex" : "flex", tones[tone])}>
          <IconCmp weight="duotone" className="size-5" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-tight">
        <AnimatedNumber value={value} suffix={suffix} />
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function EmptyState({
  icon: IconCmp, title, description, children, className,
}: { icon: Icon; title: string; description: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <span className="relative mb-5 flex size-16 items-center justify-center rounded-3xl bg-secondary text-primary">
        <span className="absolute inset-0 rounded-3xl bg-dots opacity-40" aria-hidden />
        <IconCmp weight="duotone" className="relative size-8" aria-hidden />
      </span>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Logo({ className, label = true }: { className?: string; label?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#7c6cf0] to-[#373063] text-white shadow-soft">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <path d="M12 4 2.5 9 12 14l9.5-5L12 4Z" fill="currentColor" />
          <path d="M6.5 12.2V16c1.6 1.4 3.4 2 5.5 2s3.9-.6 5.5-2v-3.8L12 15.2l-5.5-3Z" fill="currentColor" fillOpacity=".7" />
          <circle cx="20.5" cy="14.5" r="1.5" fill="#f97316" />
        </svg>
      </span>
      {label && <span className="text-[1.0625rem] font-extrabold tracking-tight">CampusNova</span>}
    </span>
  );
}
