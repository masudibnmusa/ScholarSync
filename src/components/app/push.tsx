"use client";

import * as React from "react";
import { BellRinging, BellSlash, DeviceMobile, DownloadSimple, Export } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { removePushSubscription, savePushSubscription } from "@/app/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// The browser's install prompt fires once, early; keep it for whenever the user asks to install.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let installPrompt: InstallPrompt | null = null;
const installListeners = new Set<() => void>();

/** Registers the service worker and catches the install prompt. Call once, from the signed-in shell. */
export function useAppInstallSetup() {
  React.useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch((err) => console.error("Service worker failed:", err));
    const keep = (e: Event) => { e.preventDefault(); installPrompt = e as InstallPrompt; installListeners.forEach((f) => f()); };
    const done = () => { installPrompt = null; installListeners.forEach((f) => f()); };
    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", keep); window.removeEventListener("appinstalled", done); };
  }, []);
}

const subscribeInstall = (f: () => void) => { installListeners.add(f); return () => installListeners.delete(f); };

/** VAPID keys are base64url; the Push API wants bytes. */
function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "ios-install" | "blocked" | "off" | "on";

function readState(): Promise<State> {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // iPhone and iPad only allow web push from an app added to the Home Screen (iOS 16.4+).
  if (ios && !standalone) return Promise.resolve("ios-install");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return Promise.resolve("unsupported");
  if (Notification.permission === "denied") return Promise.resolve("blocked");
  return navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => (s ? "on" : "off"));
}

/** Profile card: turn phone/desktop alerts on or off for this browser, and install the app. */
export function AlertsCard() {
  const [state, setState] = React.useState<State>("loading");
  const [busy, setBusy] = React.useState(false);
  const canInstall = React.useSyncExternalStore(subscribeInstall, () => !!installPrompt, () => false);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  React.useEffect(() => {
    let live = true;
    readState().then((s) => live && setState(s), () => live && setState("unsupported"));
    return () => { live = false; };
  }, []);

  async function turnOn() {
    if (!publicKey) return void toast.error("Alerts aren't set up on this server yet.");
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const json = sub.toJSON();
      await savePushSubscription({ endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth }, userAgent: navigator.userAgent.slice(0, 300) });
      setState("on");
      toast.success("Alerts are on", { description: "You'll get mentions, assignments, due dates and feedback on this device." });
    } catch (err) {
      console.error("Turning alerts on failed:", err);
      toast.error("Couldn't turn alerts on", { description: "Your browser may not support them. Try Chrome, Edge, Firefox or the installed app." });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      toast("Alerts are off on this device");
    } catch (err) {
      console.error("Turning alerts off failed:", err);
      toast.error("Couldn't turn alerts off");
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    const p = installPrompt;
    if (!p) return;
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === "accepted") installPrompt = null;
    installListeners.forEach((f) => f());
  }

  const on = state === "on";
  const note: Record<State, string> = {
    loading: "Checking this device…",
    unsupported: "This browser can't show alerts. Chrome, Edge and Firefox can, and so can the installed app.",
    "ios-install": "On iPhone and iPad, add ScholarSync to your Home Screen first, then turn alerts on from there.",
    blocked: "Alerts are blocked for this site. Allow notifications in your browser's site settings, then come back.",
    off: "Get mentions, new assignments, due dates and feedback here, even when ScholarSync is closed.",
    on: "On for this device. Routine chat messages stay quiet; @mentions still come through.",
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p id="alerts-label" className="flex items-center gap-2 text-sm font-bold">
            {on ? <BellRinging weight="duotone" className="size-4 text-primary" aria-hidden /> : <BellSlash weight="duotone" className="size-4 text-primary" aria-hidden />}
            Alerts on this device
          </p>
          <p className="text-xs text-muted-foreground" role="status">{note[state]}</p>
        </div>
        {(state === "on" || state === "off") && (
          <button type="button" role="switch" aria-checked={on} aria-labelledby="alerts-label" disabled={busy} onClick={on ? turnOff : turnOn}
            className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60", on ? "bg-primary" : "bg-muted-foreground/30")}>
            <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
          </button>
        )}
      </div>
      {state === "ios-install" && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-xs">
          <Export className="mt-0.5 size-4 shrink-0" aria-hidden />Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Open ScholarSync from the new icon.
        </p>
      )}
      {canInstall && (
        <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={install}>
          <DownloadSimple aria-hidden /> Install the app
        </Button>
      )}
      {!canInstall && state !== "ios-install" && (
        <p className="mt-3 flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground"><DeviceMobile className="size-3.5" aria-hidden />On a phone, use your browser&apos;s menu to add ScholarSync to your Home Screen.</p>
      )}
    </Card>
  );
}
