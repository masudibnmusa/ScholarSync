// ScholarSync service worker: shows push alerts, opens the right page when one is tapped, and keeps the last copy
// of each page and its scripts so the installed app opens offline. Everything is network-first: online, nothing
// stale is ever shown; the cache is only the fallback. Data comes from the app's own snapshot (src/lib/offline.ts).
// Signing out deletes this cache (it holds pages of the signed-in user).

const CACHE = "ss-offline-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("ss-offline-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

const OFFLINE_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · ScholarSync</title><body style="font-family:system-ui,sans-serif;background:#fbf7f0;color:#2b2622;display:grid;place-items:center;min-height:100dvh;margin:0;padding:16px;text-align:center">
<div><h1 style="font-size:1.5rem">You're offline</h1><p>This page hasn't been opened on this device yet. Open it once while online and it will be here next time.</p>
<p><a href="/" onclick="location.reload();return false" style="color:#b4583c;font-weight:700">Try again</a></p></div>`;

function cacheable(url, request) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  if (request.mode === "navigate") return /^\/(student|instructor)(\/|$)/.test(url.pathname);
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest";
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!cacheable(url, event.request)) return;
  const navigate = event.request.mode === "navigate";
  event.respondWith((async () => {
    try {
      const res = await fetch(event.request);
      // Only real pages: not a redirect to sign-in, not an error page.
      if (res.ok && !res.redirected && res.type === "basic") {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then((c) => c.put(event.request, copy)));
      }
      return res;
    } catch (err) {
      const cache = await caches.open(CACHE);
      const hit = (await cache.match(event.request)) || (navigate && (await cache.match(event.request, { ignoreSearch: true })));
      if (hit) return hit;
      if (navigate) return new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      throw err;
    }
  })());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "ScholarSync" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "ScholarSync", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Reuse an open ScholarSync window if there is one.
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.navigate(url).then((w) => (w || open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
