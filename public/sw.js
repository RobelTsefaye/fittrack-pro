const CACHE = "fittrack-v10-pwa";
const SW_VERSION = "10.0";

self.addEventListener("install", (event) => {
  console.log(`[SW] Installing ${SW_VERSION}`);
  // No pre-caching on install — authenticated pages would cache as redirects.
  // Pages are cached on first visit via the network-first handler below.
  event.waitUntil(self.skipWaiting());
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
