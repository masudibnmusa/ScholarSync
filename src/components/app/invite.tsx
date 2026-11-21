"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise, Check, Copy, LinkSimple, Ticket } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { resetJoinCode, setJoiningOpen } from "@/app/actions";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

/** Instructor: the course's invite link and code, ready to copy, plus who may join and a way to retire the code. */
export function InviteButton({ courseId, code, courseCode, joiningOpen, onChanged }: {
  courseId: string; code: string; courseCode: string; joiningOpen: boolean; onChanged: () => Promise<unknown> | void;
}) {
  const [copied, setCopied] = React.useState<"link" | "code" | null>(null);
  const [busy, setBusy] = React.useState<"open" | "reset" | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  async function copy(what: "link" | "code", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Copy failed. Select the text and copy it instead.");
    }
  }
  async function run(kind: "open" | "reset", fn: () => Promise<unknown>, ok: string) {
    setBusy(kind);
    try {
      await fn();
      await onChanged();
      toast.success(ok);
    } catch (err) {
      console.error("Invite settings failed:", err);
      toast.error(kind === "reset" ? "Could not reset the code" : "Could not change who can join");
    }
    setBusy(null);
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary"><LinkSimple aria-hidden /> Invite</Button>
      </DialogTrigger>
      <DialogContent>
        {/* Only rendered while open, in the browser, so window is available. */}
        {(() => {
          const link = `${window.location.origin}/join/${code}`;
          return (
            <>
              <DialogHeader>
                <DialogTitle>Invite students to {courseCode}</DialogTitle>
                <DialogDescription>Share the link, or have students enter the code on their dashboard. They join with one click.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
                  <div className="min-w-0">
                    <p id="joining-label" className="text-sm font-bold">Accept new students</p>
                    <p className="text-xs text-muted-foreground">{joiningOpen ? "Anyone with the link or code, or from the course catalog, can join." : "Joining is off. You can still add students by email."}</p>
                  </div>
                  <button type="button" role="switch" aria-checked={joiningOpen} aria-labelledby="joining-label" disabled={busy !== null}
                    onClick={() => run("open", () => setJoiningOpen(courseId, !joiningOpen), joiningOpen ? "Joining turned off" : "Joining turned on")}
                    className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60", joiningOpen ? "bg-primary" : "bg-input")}>
                    <span className={cn("inline-block size-5 rounded-full bg-card shadow-soft transition-transform", joiningOpen ? "translate-x-6" : "translate-x-1")} />
                  </button>
                </div>
                <div className={cn("space-y-4 transition-opacity", !joiningOpen && "pointer-events-none opacity-50")} aria-hidden={!joiningOpen || undefined}>
                  <Field label="Invite link" htmlFor="invite-link">
                    <div className="flex gap-2">
                      <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} tabIndex={joiningOpen ? undefined : -1} />
                      <Button type="button" variant="outline" onClick={() => copy("link", link)} aria-label="Copy invite link" tabIndex={joiningOpen ? undefined : -1}>
                        {copied === "link" ? <Check weight="bold" aria-hidden /> : <Copy aria-hidden />} {copied === "link" ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </Field>
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-butter px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground/80">Invite code</p>
                      <p className="font-mono text-2xl font-bold tracking-[0.2em]">{code}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => copy("code", code)} aria-label="Copy invite code" tabIndex={joiningOpen ? undefined : -1}>
                      {copied === "code" ? <Check weight="bold" aria-hidden /> : <Copy aria-hidden />} {copied === "code" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>Code shared too widely? Make a new one; the old link stops working.</span>
                  <Button type="button" variant="ghost" size="sm" loading={busy === "reset"} disabled={busy !== null} onClick={() => setConfirmReset(true)}>
                    {busy !== "reset" && <ArrowClockwise aria-hidden />} Reset code
                  </Button>
                </div>
              </div>
              <ConfirmDialog open={confirmReset} onOpenChange={setConfirmReset} title="Reset the invite code?" confirmLabel="Reset code"
                description={`The current link and code (${code}) stop working right away. Students already in ${courseCode} stay enrolled.`}
                onConfirm={() => run("reset", () => resetJoinCode(courseId), "New invite code ready")} />
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}

/** Student: type a code from the instructor and go to its invite page. */
export function JoinWithCodeButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const clean = code.toUpperCase().replace(/[\s-]/g, "");
  const valid = /^[A-Z0-9]{6}$/.test(clean);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Ticket aria-hidden /> Join with code</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Join with a code</DialogTitle>
          <DialogDescription>Your instructor shares a 6-character code, like KYM73W.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (valid) router.push(`/join/${clean}`); }} className="space-y-4">
          <Field label="Invite code" htmlFor="join-code">
            <Input id="join-code" value={code} autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={9}
              placeholder="ABC123" className="font-mono text-lg uppercase tracking-[0.2em]" onChange={(e) => setCode(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid}>Continue</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
