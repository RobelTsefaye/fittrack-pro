// ─── FitTrack Pro Service Worker ──────────────────────────────────────────────
// Strategy:
//   /_next/static/*  → cache-first (content-hashed, safe forever)
//   /api/*           → network-only, offline → 503 JSON so app uses IndexedDB
//   HTML navigation  → network-first, cache fallback → always offline-accessible
//   RSC fetches      → network-first, cache fallback → enables offline navigation
//   Everything else  → network-first, cache fallback

const CACHE = "fittrack-v13-pwa";
const SW_VERSION = "13.0";

// Routes to pre-cache when the app requests it (via postMessage)
const KEY_ROUTES = [
  "/workouts/new",
  "/workouts",
  "/dashboard",
  "/body-weight",
  "/exercises",
];

// ─── Offline fallback HTML ────────────────────────────────────────────────────
const OFFLINE_HTML = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>FitTrack Pro — Offline</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0d0d0d;color:#fff;
     display:flex;align-items:center;justify-content:center;
     min-height:100dvh;padding:1.5rem;text-align:center}
.card{max-width:320px;width:100%}
.icon{font-size:3rem;margin-bottom:1rem}
h1{font-size:1.25rem;font-weight:700;margin-bottom:.5rem}
p{color:#888;font-size:.875rem;line-height:1.5;margin-bottom:1.5rem}
button{background:#7c3aed;color:#fff;border:none;border-radius:.75rem;
       padding:.875rem 2rem;font-size:.9rem;font-weight:600;cursor:pointer;
       width:100%;margin-bottom:.75rem}
.secondary{background:transparent;border:1px solid #333;color:#aaa}
</style></head><body>
<div class="card">
  <div class="icon">📴</div>
  <h1>You're offline</h1>
  <p>Open the app once with internet to cache it for offline use. Your workout data is saved locally.</p>
  <button onclick="location.reload()">Try again</button>
  <button class="secondary" onclick="history.back()">Go back</button>
</div>
</body></html>`;

function offlineHtml() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function offlineJson() {
  return new Response(JSON.stringify({ error: "offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log(`[SW] Installing ${SW_VERSION}`);
  // Skip waiting immediately — cache warming happens from the app via postMessage
  event.waitUntil(self.skipWaiting());
});

// ─── Activate ─────────────────────────────────────────────────────────────────
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

// ─── Cache warming via postMessage ────────────────────────────────────────────
// The app sends { type: "WARM_CACHE", routes: [...] } after login while online.
self.addEventListener("message", (event) => {
  if (!event.data) return;

  // ── Purge personalized responses on logout/user-switch ──────────────────────
  // HTML and RSC responses cached below carry the *current* user's rendered
  // data. Without this, signing out (or a second user signing in on the same
  // device) would let network-first fall back to another user's cached pages
  // while offline — a cross-user data leak. The app posts { type: "CLEAR_CACHE" }
  // from its sign-out flow; we drop every cached entry except the immutable,
  // content-hashed /_next/static/* assets (shared across users, safe to keep).
  if (event.data.type === "CLEAR_CACHE") {
    console.log("[SW] Clearing user-specific caches");
    event.waitUntil(
      caches.open(CACHE).then((cache) =>
        cache.keys().then((requests) =>
          Promise.all(
            requests
              .filter((req) => {
                const p = new URL(req.url).pathname;
                return !p.startsWith("/_next/static/");
              })
              .map((req) => cache.delete(req))
          )
        )
      )
    );
    return;
  }

  if (event.data.type !== "WARM_CACHE") return;
  const routes = Array.isArray(event.data.routes) ? event.data.routes : KEY_ROUTES;
  console.log(`[SW] Warming cache for ${routes.length} routes`);
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(
        routes.map((url) =>
          fetch(url, { credentials: "include" })
            .then((res) => {
              if (res.ok) cache.put(url, res.clone());
              return res;
            })
            .catch(() => {
              console.warn(`[SW] Could not warm cache for ${url}`);
            })
        )
      )
    )
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Auth routes always bypass SW — must reach server
  if (url.pathname.startsWith("/api/auth")) return;

  // ── /_next/static/* → cache-first (content-hashed, immutable) ──────────────
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

  // ── /api/* → network-only, offline 503 ─────────────────────────────────────
  if (url.pathname.startsWith("/api/")) {
    // Non-GET mutations (POST/PATCH/DELETE): pass through, let the app queue them
    if (request.method !== "GET") return;
    event.respondWith(
      fetch(request, { credentials: "include" }).catch(() => offlineJson())
    );
    return;
  }

  // ── Detect RSC requests (Next.js App Router client navigation) ──────────────
  // RSC payload requests have ?_rsc= param or Accept: text/x-component
  const isRsc =
    url.searchParams.has("_rsc") ||
    (request.headers.get("accept") ?? "").includes("text/x-component");

  if (isRsc) {
    // RSC: network-first, cached RSC fallback, then trigger a full-page reload
    event.respondWith(
      fetch(request, { credentials: "include" })
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // No RSC cache → send a special response that triggers a full reload
          // Next.js will retry as a full navigation and hit the HTML cache
          return new Response(null, { status: 503 });
        })
    );
    return;
  }

  // ── HTML navigations → network-first, best cached fallback ─────────────────
  const isNavigation =
    request.method === "GET" &&
    (request.mode === "navigate" ||
      (request.headers.get("accept") ?? "").includes("text/html"));

  if (isNavigation) {
    event.respondWith(
      fetch(request, { credentials: "include" })
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(async () => {
          // 1. Exact URL match
          const exact = await caches.match(request);
          if (exact) return exact;

          // 2. Try to serve the closest useful app page from cache
          // (user can navigate inside the app using client-side routing)
          const fallbacks = [
            "/workouts/new",
            "/dashboard",
            "/workouts",
            "/login",
            "/",
          ];
          for (const fb of fallbacks) {
            const cached = await caches.match(fb);
            if (cached) {
              // Clone and rewrite — the page JS will handle client-side routing
              return cached;
            }
          }

          return offlineHtml();
        })
    );
    return;
  }

  // ── Everything else (images, fonts, SW assets) → network-first, cache fallback
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(
        async () =>
          (await caches.match(request)) || new Response("", { status: 404 })
      )
  );
});
