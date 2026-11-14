"use client";

import { cn } from "@/lib/utils";

// Two lines that turn into an X, animated on the base curve (landing-page-design B7).
export function MenuToggle({
  open,
  onToggle,
  controls,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  className?: string;
}) {
  const line =
    "absolute left-3 right-3 top-1/2 h-0.5 rounded-full bg-current transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";
  return (
    <button
      type="button"
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        "relative size-11 shrink-0 rounded-lg hover:bg-muted transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
    >
      <span className={cn(line, open ? "rotate-45" : "-translate-y-1")} />
      <span className={cn(line, open ? "-rotate-45" : "translate-y-1")} />
    </button>
  );
}
