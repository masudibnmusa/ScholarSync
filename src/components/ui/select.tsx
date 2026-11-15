"use client";

import * as React from "react";
import * as S from "@radix-ui/react-select";
import { CaretDown, Check } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export const Select = S.Root;
export const SelectValue = S.Value;

export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof S.Trigger>) {
  return (
    <S.Trigger
      className={cn(
        "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input bg-card px-3.5 text-base text-foreground transition-[border-color,box-shadow] duration-200 hover:border-primary/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 data-[placeholder]:text-muted-foreground md:h-10 md:text-sm [&>span]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <S.Icon asChild>
        <CaretDown className="size-4 shrink-0 text-muted-foreground" />
      </S.Icon>
    </S.Trigger>
  );
}

export function SelectContent({ className, children, ...props }: React.ComponentProps<typeof S.Content>) {
  return (
    <S.Portal>
      <S.Content
        position="popper"
        sideOffset={6}
        className={cn(
          "z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lift data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2",
          className,
        )}
        {...props}
      >
        <S.Viewport className="p-1.5">{children}</S.Viewport>
      </S.Content>
    </S.Portal>
  );
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof S.Item>) {
  return (
    <S.Item
      className={cn(
        "relative flex min-h-9 cursor-pointer select-none items-center rounded-lg py-1.5 pl-2.5 pr-8 text-sm font-medium outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <S.ItemText>{children}</S.ItemText>
      <S.ItemIndicator className="absolute right-2.5">
        <Check weight="bold" className="size-4 text-primary" />
      </S.ItemIndicator>
    </S.Item>
  );
}
