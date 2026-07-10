# Offline-First Roadmap

**Branch:** `feature/offline-phase2-local-bundle` (Phase 1 merged to `main`)
**Status:** Phase 2 code-complete, native static export builds clean and verified via `xcodebuild`; on-device/airplane-mode test still pending before merge
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
- [x] **On-device tested** (Xcode console + Safari Web Inspector, real device): `save`/`load`/`clear` round trip confirmed correct — save → `{success:true}`, load → `{token:"hallo"}`, clear → `{success:true}`, load after clear → `{token:null}`. Full App-target build (App + Watch + Complication + Widget) also verified to compile clean via `xcodebuild`.

### Phase 2 — Bundle the UI locally; app always opens
**Goal:** the app opens instantly with zero network — proves the single biggest complaint is fixed, before any caching/sync work exists.

- [x] Convert `(app)` layout + all 18 server-auth-gated pages (17 originally audited + `plans/[planId]`, found necessary mid-phase) from server-side `auth()`/`redirect()` to client-side (`useAuthGate`/`RequireAuth`, token from Phase 1)
- [x] Convert 13 API routes from cookie-only `auth()` to `resolveUserIdForDataApi()` (dual cookie + Bearer), add 3 new bundling routes (`/api/records`, `/api/dashboard/client-payload`, `/api/dashboard/muscle-heatmap`) so client components don't need N separate calls
- [x] Global `fetch` patch (`NativeAuthFetchPatch`) attaches the Bearer token and rewrites relative URLs to the production origin — retrofits ~25 pre-existing components' plain `fetch()` calls without touching each one
- [x] Switch Next.js to static export (`output: "export"`) for native builds only (`NATIVE_BUILD=1`, see `next.config.ts`/`scripts/build-native.mjs`); API routes stay server-hosted on Vercel, moved out of the tree for the duration of that build only
- [x] Point Capacitor `webDir` at the exported output (`out/`); dropped `server.url` entirely — new `npm run sync:native` runs the export + `cap sync ios`
- [x] **Fixed 4 dynamic page routes** (`workouts/[id]`, `exercises/[id]`, `plans/[planId]`, `health/[metric]`) needing `generateStaticParams()` — client components can't export it themselves (needs a non-`"use client"` file), so each got a thin server wrapper `page.tsx` (just `generateStaticParams`) delegating to a `page-client.tsx` with the real logic. Placeholder param for the 3 truly dynamic ones (real id read via `useParams()` client-side after the SPA router navigates); `health/[metric]` lists all real slugs since they're known at build time.
- [x] **Fixed root layout** (`src/app/layout.tsx`): `resolveAppLocale()` calls `cookies()`/`auth()`/Prisma — none exist at static-export build time. Native builds now use a hardcoded `"en"` locale; real Vercel build unaffected. Per-user locale on native is a Phase 3+ concern.
- [x] **Verified:** `npm run build:native` produces a clean static export (38 pages, 0 errors); `npx next build` (normal Vercel path) re-verified unaffected afterward; `npx cap sync ios` copies it into `ios/App/App/public` correctly; full Xcode `App` target (App + Watch App + RestTimerWidget + Capacitor plugins) compiles clean against the synced bundle. (One unrelated pre-existing failure found in `FitTrackComplicationExtension` — a `#Preview` macro needing iOS 17 — confirmed via `git diff`/`git log` to be untouched by this phase; not fixed here, out of scope.)
- [ ] **Test:** airplane mode, force-quit, relaunch on a real device/simulator — app opens to the shell/login or dashboard frame with zero network. Data fetches still fail offline at this stage (expected — that's Phase 3), but the app itself is never a blank white screen again. **Not yet done — needs you to run it; nothing merges to `main` until this passes.**

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
- 2026-07-10: Discovered a full Xcode/xcodebuild toolchain is available in this environment — used it to compile the whole App target (App + Watch + Complication + RestTimerWidget) and to standalone-verify the Keychain save/load/clear logic against the real Security framework before asking for on-device confirmation. Root-caused an early "always undefined" false alarm to an accidental `git checkout main` (from an earlier interrupted merge attempt) silently leaving the working tree on the wrong branch, so Xcode was rebuilding a version without the new plugin file at all — fixed by switching back to `feature/offline-first`. Phase 1 fully confirmed on-device afterward: save/load/clear round trip correct in the real Keychain via Xcode console + Safari Web Inspector. Phase 1 merged to `main`.
- 2026-07-10: Started Phase 2 on `feature/offline-phase2-local-bundle`. Converted the `(app)` layout and all 18 server-auth-gated pages to client components; converted 13 API routes to dual cookie/Bearer auth; added the global fetch patch; wired up `output: "export"` for native builds via `scripts/build-native.mjs` (moving `middleware.ts`/`src/app/api`/`src/app/.well-known`/`src/app/manifest.ts` outside `src/app/` for the duration of that build only — renaming *within* `src/app/` doesn't work, Next.js still treats it as a route). Iteratively fixed each newly-surfaced static-export blocker (missing `generateStaticParams()` on 4 dynamic routes via thin server-wrapper + client-component split; root layout's `resolveAppLocale()` calling `cookies()`/`auth()`/Prisma at build time). `npm run build:native` now succeeds end-to-end (38 pages, 0 errors), confirmed the normal Vercel build is unaffected, wired `capacitor.config.ts` to the exported bundle (dropped `server.url`), and verified via `xcodebuild` that the full App target compiles against the synced output.
- 2026-07-10: First real-device test caught a bug the build couldn't: login failed silently, endlessly redirecting back to `/login` (Xcode console showed `NativeAuthToken load` → `{"token":null}` forever — the native-login POST was never actually landing). Root cause: with the UI now served from `capacitor://localhost` instead of the live Vercel origin, every `fetch("/api/...")` became a genuine cross-origin request, and none of the API routes send CORS headers (they never needed to before this phase) — WKWebView silently blocks these exactly like a browser would. Fixed by enabling Capacitor's native HTTP bridge (`plugins.CapacitorHttp.enabled: true` in `capacitor.config.ts`), which routes `fetch`/`XHR` through native `URLSession` instead of the WebView, sidestepping browser CORS entirely with no server-side changes needed. Re-synced + re-verified the App target compiles clean. **Needs a second on-device airplane-mode test round** before merge — this exact failure mode (login/API calls) is precisely what that test needs to re-check.
