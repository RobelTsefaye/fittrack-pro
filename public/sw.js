const CACHE = "fittrack-v9-pwa";
const SW_VERSION = "9.0";

// App shell pages to pre-cache on install so the app opens offline immediately
const PRECACHE_URLS = [
  "/",
  "/dashboard",
  "/workouts",
  "/workouts/new",
  "/exercises",
  "/body-weight",
  "/plans",
  "/settings",
  "/offline",
];

self.addEventListener("install", (event) => {
  console.log(`[SW] Installing ${SW_VERSION}`);
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // Pre-cache app shell pages; ignore individual failures (page may not exist yet)
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  console.log(`[SW] Activating ${SW_VERSION}, clearing old caches`);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Always bypass for auth — must reach server
  if (url.pathname.startsWith("/api/auth")) {
    return;
  }

  // Static Next.js assets: cache-first (they're content-hashed)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
        )
      )
    );
    return;
  }

  // API calls: network-first, let IndexedDB offline layer handle data
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() => {
        // Return a generic offline JSON response so callers don't crash
        return new Response(
          JSON.stringify({ error: "offline" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // HTML navigations and app shell pages: network-first, cache fallback
  const isNavigation =
    request.mode === "navigate" ||
    (request.headers.get("accept") ?? "").includes("text/html");

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // Fallback to root for SPA-style navigation when specific page not cached
          const root = await caches.match("/dashboard");
          if (root) return root;
          return caches.match("/");
        })
    );
    return;
  }

  // Everything else (fonts, images, etc.): network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
