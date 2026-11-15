"use client";

import * as React from "react";
import * as T from "@radix-ui/react-tooltip";
import * as P from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const TooltipProvider = T.Provider;

/** Hover/focus label. Always pair icon-only buttons with an aria-label too; tooltips don't open on touch. */
export function Tooltip({ label, side = "bottom", children }: { label: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; children: React.ReactNode }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lift animate-in fade-in-0 zoom-in-95"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export function PopoverContent({ className, sideOffset = 8, align = "end", ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-80 rounded-2xl border bg-popover text-popover-foreground shadow-lift outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}
