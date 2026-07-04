// Minimal app-shell service worker. Exists so the app is a valid installable
// PWA and repeat loads are faster. Deliberately NOT a full offline app: prices
// come live from Supabase, so cross-origin requests are never intercepted and
// no API data is ever cached. Bump the version to invalidate old caches when
// the caching strategy changes (Vite asset filenames already carry hashes, so
// day-to-day deploys do not need a bump).
const CACHE_NAME = "urimalu-shell-v1";

// The core shell: the HTML entry, the manifest, and the install icons.
const SHELL_URLS = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Same-origin only: Supabase calls, fonts, and analytics pass straight through.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so users always get the newest HTML, with the
  // cached shell as a fallback when the network is unavailable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Hashed build assets and the precached shell files: cache first. Vite
  // fingerprints /assets/ filenames, so a cached copy can never go stale.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res.ok && url.pathname.startsWith("/assets/")) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return res;
      });
    })
  );
});
