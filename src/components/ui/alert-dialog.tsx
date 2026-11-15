"use client";

import * as React from "react";
import * as A from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/button";

/** Confirmation for actions that are hard to undo. Focus starts on Cancel so Enter never confirms by accident. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Delete", destructive = true, onConfirm,
}: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void;
}) {
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-scrim/55 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <A.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-5 rounded-3xl border bg-popover p-6 text-popover-foreground shadow-lift duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="space-y-1.5">
            <A.Title className="text-lg font-bold leading-tight">{title}</A.Title>
            <A.Description className="text-sm text-muted-foreground">{description}</A.Description>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <A.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </A.Cancel>
            <A.Action asChild>
              <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>{confirmLabel}</Button>
            </A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
