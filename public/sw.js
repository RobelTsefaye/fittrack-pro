const CACHE = "fittrack-v11-pwa";
const SW_VERSION = "11.0";

const OFFLINE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FitTrack Pro</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100dvh;margin:0;background:#0a0a0a;color:#fff;text-align:center;padding:1rem}h1{font-size:1.4rem;margin-bottom:.5rem}p{color:#888;font-size:.9rem}</style></head><body><div><h1>FitTrack Pro</h1><p>You're offline. Connect to the internet and reload the page.</p></div></body></html>`;

function offlineHtml() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

self.addEventListener("install", (event) => {
  console.log(`[SW] Installing ${SW_VERSION}`);
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

  // Only handle same-origin GETs
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Auth always bypasses SW — must reach server
  if (url.pathname.startsWith("/api/auth")) {
    return;
  }

  // Static Next.js assets: cache-first (content-hashed, safe forever)
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

  // API calls: always try network; return 503 JSON when offline
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    return;
  }

  // HTML navigations: network-first, cache fallback, offline page as last resort
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
          // Try exact URL, then login page (always cached after first visit),
          // then root, then inline offline fallback — never return null.
          return (
            (await caches.match(request)) ||
            (await caches.match("/login")) ||
            (await caches.match("/")) ||
            offlineHtml()
          );
        })
    );
    return;
  }

  // Everything else (images, fonts, etc.): network-first, cache fallback, 404 last resort
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(
        async () =>
          (await caches.match(request)) ||
          new Response("", { status: 404 })
      )
  );
});
