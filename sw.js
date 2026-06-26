// sw.js — offline app shell for SamPlan. Network-first (always fresh when
// online), falling back to the cache when offline. Bump VERSION on each deploy.
const VERSION = "samplan-v2";
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
  // Network-first so deploys land immediately; fall back to cache offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(VERSION).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
  );
});
