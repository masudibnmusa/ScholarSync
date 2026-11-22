"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Database, DownloadSimple, Trash } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { deleteAccount, exportMyData } from "@/app/actions";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/components/app/user-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useT } from "@/components/locale";

function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useT();
  const user = useUser();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await deleteAccount(email);
      if (result === "wrong-email") setError(t("That isn't the email address of this account."));
      else if (result === "has-courses") setError(t("You teach courses. Delete them first, then your account."));
      else {
        await useAppStore.getState().logout(); // this browser's session, offline copies and live channels
        toast.success(t("Your account was deleted"));
        router.replace("/");
        router.refresh();
        return;
      }
    } catch (err) {
      console.error("Deleting the account failed:", err);
      toast.error(t("Could not delete your account"));
    }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setEmail(""); setError(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Delete your account?")}</DialogTitle>
          <DialogDescription>
            {t("Your profile, photo, course places, team memberships, stand-ups, peer reviews and notifications are deleted. Tasks, messages and files you shared stay with your team, without your name. This can't be undone.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={remove} noValidate className="space-y-4">
          <Field label={t("Type your email address to confirm")} htmlFor="delete-email" error={error} hint={user.email}>
            <Input id="delete-email" type="email" autoComplete="off" value={email} autoFocus onChange={(e) => { setEmail(e.target.value); setError(null); }} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
            <Button type="submit" variant="destructive" loading={busy} disabled={!email.trim()}>{t("Delete account")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Profile card: a copy of everything stored about me (JSON), and deleting the account. */
export function MyDataCard() {
  const { t } = useT();
  const [exporting, setExporting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function download() {
    setExporting(true);
    try {
      const data = await exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `scholarsync-my-data-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Exporting my data failed:", err);
      toast.error(t("Could not download your data"));
    }
    setExporting(false);
  }

  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-sm font-bold"><Database weight="duotone" className="size-4 text-primary" aria-hidden />{t("Your data")}</p>
      <p className="mb-3 text-xs text-muted-foreground">{t("A copy of everything ScholarSync stores about you, as a JSON file.")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" loading={exporting} onClick={download}>{!exporting && <DownloadSimple aria-hidden />} {t("Download my data")}</Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-rose hover:text-destructive" onClick={() => setDeleting(true)}><Trash aria-hidden /> {t("Delete account")}</Button>
      </div>
      <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} />
    </Card>
  );
}
