# Offline-First Roadmap

**Branch:** `feature/offline-first`
**Status:** Phase 1 code complete, awaiting on-device test
**Last updated:** 2026-07-10

## Why this is a real rearchitecture, not a patch

Two structural facts about the current app make "just works offline" impossible without changing them:

1. **The native shell loads the entire web app from a live URL every launch.**
   `capacitor.config.ts` points `server.url` at `https://fittrack-pro-ashen.vercel.app` instead of bundling static files, explicitly because the app has server-only routes (API endpoints, Prisma, NextAuth) that can't be statically exported as-is. With zero network, the WKWebView has nothing to load — not even a blank shell, no error screen, nothing.
2. **There is no local data store.** Every screen fetches directly from a Postgres-backed API route. There's no cache, no offline write queue, nothing to fall back to.
3. **Auth is server-side session cookies**, checked in Server Components. 17 files under `src/app/(app)/` call `await auth()` server-side and `redirect("/login")` (a server-only API) if it's missing — this is essentially every screen in the app, not an edge case.

Fixing this properly means: bundle the UI locally (so the app always opens), move auth to a token model the native shell owns (so a static/client-rendered UI can still know who's logged in), then layer local caching and an offline write queue on top. Each phase below is independently shippable and testable before starting the next.

## Phases

### Phase 1 — Native token-based auth (no offline behavior change yet)
**Goal:** the native app authenticates via a stored Bearer token instead of (or alongside) the session cookie, so later phases have something to authenticate with once the cookie-based server session is gone.

- [x] Add local secure token storage on-device — `NativeAuthTokenPlugin.swift` (Keychain), deliberately separate from the existing `SyncTokenPlugin`/"Für Hintergrund-Sync verwenden" token (that one's an opt-in native-background convenience; this one is becoming the app's actual login credential — see the plugin's doc comment)
- [x] Native login flow: `POST /api/auth/native-login` (new route) → mints an `ApiToken` row via the existing `hashApiTokenSecret`/`resolveUserIdForDataApi` path (same one `WatchAPIProxy`/the PiP SSE stream already use) → stored via the plugin above. Wired additively into `login-form.tsx`: fires only when `Capacitor.isNativePlatform()`, alongside the unchanged cookie `signIn()` call, best-effort (a failure here never blocks login)
- [x] `authenticatedFetch()` helper (`src/lib/native/native-auth-token.ts`) attaches the stored token as `Authorization: Bearer` when present, falls back to plain `fetch` (cookie auth) otherwise — not wired into any page yet, that's Phase 2's job; exists now so it's independently testable
- [x] **Tested:** `/api/auth/native-login` end-to-end against the dev DB (wrong password → 401, correct password → token, token successfully authenticates a Bearer-protected route, temp user cleaned up). Existing cookie-based browser login re-verified unaffected (redirects to dashboard, no console errors)
- [ ] **Still needs on-device testing** (Xcode): log in from the actual native app, confirm the Keychain token is saved (no way to verify Keychain behavior from this environment)

### Phase 2 — Bundle the UI locally; app always opens
**Goal:** the app opens instantly with zero network — proves the single biggest complaint is fixed, before any caching/sync work exists.

- [ ] Convert `(app)` layout + the 17 server-auth-gated pages from server-side `auth()`/`redirect()` to client-side (token from Phase 1) — the biggest mechanical chunk of this phase
- [ ] Switch Next.js to static export (`output: "export"`) for the pages bundled into the app; API routes stay server-hosted on Vercel
- [ ] Point Capacitor `webDir` at the exported output; drop `server.url`
- [ ] **Test:** airplane mode, force-quit, relaunch — app opens to the shell/login or dashboard frame. Data fetches still fail offline at this stage (expected — that's Phase 3), but the app itself is never a blank white screen again

### Phase 3 — Local read cache (incremental, screen by screen)
**Goal:** each screen shows last-known data immediately, refreshes in the background when online, and doesn't go blank when offline.

- [ ] Add local SQLite (`@capacitor-community/sqlite` or similar) as the on-device cache store
- [ ] Cache-then-network pattern, rolled out one screen at a time so each is independently testable:
  - [ ] Workouts list
  - [ ] Exercises list
  - [ ] Dashboard
  - [ ] Plans
  - [ ] Health screens
- [ ] **Test per screen:** load once online, go offline, relaunch — screen shows the cached data instead of an error

### Phase 4 — Offline write queue
**Goal:** logging a set, starting/finishing a workout, etc. work offline and sync once back online.

- [ ] Local queue table for pending mutations
- [ ] Optimistic local apply + background flush when connectivity returns
- [ ] Basic conflict handling (last-write-wins to start; revisit if that's not good enough in practice)
- [ ] **Test:** airplane mode, log a full workout, re-enable network, confirm it appears server-side unchanged

### Phase 5 — Background sync polish + Watch interaction
**Goal:** tie the queue flush into the existing `BackgroundSyncManager` infra, and make sure the Watch's own native fallback (`WatchAPIProxy`) degrades sensibly if the phone itself is offline.

- [ ] Auto-flush the write queue via existing background task scheduling
- [ ] Verify/adjust Watch-side behavior when the phone has no connectivity at all
- [ ] **Test:** end-to-end offline workout on phone + Watch cardio session, both reconciling once back online

## Explicitly out of scope for now
- Real conflict resolution beyond last-write-wins (revisit only if it causes actual problems in testing)
- Offline support for AI/coach features (inherently need a live model call)
- Multi-device simultaneous-edit conflicts

## Log
- 2026-07-10: Investigated current architecture (`capacitor.config.ts`, 17 server-auth pages, no existing local-storage plugin). Wrote this roadmap. Starting Phase 1.
- 2026-07-10: Phase 1 code complete — native login route, Keychain token plugin, `authenticatedFetch` helper, wired additively into the login form. Verified server-side end-to-end; on-device Keychain test still pending (needs Xcode/real device).
