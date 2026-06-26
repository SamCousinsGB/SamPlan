// sw.js — offline app shell for SamPlan. Cache-first with background refresh
// (stale-while-revalidate). Bump VERSION on each deploy to roll the cache.
const VERSION = "samplan-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./css/styles.css",
  "./js/main.js",
  "./js/state.js",
  "./js/rooms.js",
  "./js/units.js",
  "./js/grid.js",
  "./js/render.js",
  "./js/furniture.js",
  "./js/input.js",
  "./js/ui.js",
  "./js/export.js",
  "./js/share.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(VERSION).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached || caches.match("./index.html"));
      return cached || network;
    })
  );
});
