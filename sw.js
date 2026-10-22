/*
 * Service Worker — Nuestro Hogar
 *
 * Threat-model discipline (see docs/THREAT_MODEL.md, control T3):
 *  - Versioned cache name; old caches are purged on activate.
 *  - Caches ONLY the static app shell (same-origin GET).
 *  - NEVER caches cross-origin requests — in Phase 2 the AI proxy lives on a
 *    different origin, so its responses (which derive from a secret) always go
 *    straight to the network and are never persisted here.
 *  - Non-GET requests are never touched.
 */

const CACHE = "nuestro-hogar-v154";

// The app shell. Keep this list explicit — only known static assets.
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/badge-mono.png",
  "./icons/cats/atena.png",
  "./icons/cats/thor.png",
  "./icons/cats/rum.png",
  "./icons/purr.png",
  "./icons/streak.png",
  "./icons/level.png",
  "./fonts/PixelOperator.ttf",
  "./fonts/PixelOperator-Bold.ttf",
  "./fonts/PixelOperator8.ttf",
  "./fonts/PixelOperator8-Bold.ttf"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only ever handle same-origin GETs. Everything else (POST, and any
  // cross-origin call such as the future AI proxy) bypasses the SW entirely.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Static assets: cache-first, then network (and cache a copy for next time).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});

// ---- Web push (for reminder alerts; delivery driven by the backend) ----
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: "Olympaws", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Olympaws";
  // Absolute URLs resolved from the SW scope so the OS can always fetch them.
  // icon = the big full-colour image in the expanded notification;
  // badge = the small status-bar mark, which MUST be a transparent monochrome
  // silhouette (badge-mono.png) — a full-colour icon there renders as a blank
  // white square on Android ("no photo of the app").
  const options = {
    body: data.body || "",
    icon: new URL("icons/icon-192.png", self.registration.scope).href,
    badge: new URL("icons/badge-mono.png", self.registration.scope).href,
    tag: data.tag,
    data: { url: data.url || "./" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
