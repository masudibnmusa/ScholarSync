"use client";

import * as React from "react";
import * as TG from "@radix-ui/react-toggle-group";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Single-choice pill switch with a sliding indicator. Arrow keys move between options (Radix roving focus). */
export function Segmented<T extends string>({
  value, onChange, options, label, className,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; label: string; className?: string }) {
  const id = React.useId();
  return (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-muted p-1", className)}
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          className="tap relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground data-[state=on]:text-foreground"
        >
          {value === o.value && (
            <motion.span layoutId={id} className="absolute inset-0 rounded-lg bg-card shadow-soft" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
          )}
          <span className="relative inline-flex items-center gap-1.5">{o.label}</span>
        </TG.Item>
      ))}
    </TG.Root>
  );
}
