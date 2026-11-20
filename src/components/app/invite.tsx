"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LinkSimple, Ticket } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

/** Instructor: the course's invite link and code, ready to copy. */
export function InviteButton({ code, courseCode }: { code: string; courseCode: string }) {
  const [copied, setCopied] = React.useState<"link" | "code" | null>(null);
  async function copy(what: "link" | "code", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Copy failed. Select the text and copy it instead.");
    }
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
                <Field label="Invite link" htmlFor="invite-link">
                  <div className="flex gap-2">
                    <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                    <Button type="button" variant="outline" onClick={() => copy("link", link)} aria-label="Copy invite link">
                      {copied === "link" ? <Check weight="bold" aria-hidden /> : <Copy aria-hidden />} {copied === "link" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </Field>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-butter px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground/80">Invite code</p>
                    <p className="font-mono text-2xl font-bold tracking-[0.2em]">{code}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => copy("code", code)} aria-label="Copy invite code">
                    {copied === "code" ? <Check weight="bold" aria-hidden /> : <Copy aria-hidden />} {copied === "code" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
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
