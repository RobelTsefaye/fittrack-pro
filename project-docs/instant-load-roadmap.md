# Instant-Load Roadmap (cache-first everywhere)

**Branch:** `feature/instant-load-cache-first` — nothing lands on `main` until the whole rollout is done and verified on-device. Every commit for this effort goes on this branch only.
**Status:** Phase A and Phase B are code-complete. Follow-up hardening now also repairs orphaned workout queues, warms prior-set hints for offline use, and expands native HealthKit import. On-device verification remains the merge gate.
**Last updated:** 2026-07-13

## ⏭️ Resume here (next session)

1. Test this branch on-device before merging: confirm the cache-first screens survive airplane-mode relaunch; deleting/cancelling a workout no longer shows a `no_snapshot` sync toast; an offline new workout shows cached "last time" hints; and HealthKit imports the newly covered metrics after re-authorizing access.
2. This is all on `feature/instant-load-cache-first`. **Do not merge to `main`** until the user explicitly asks, per their original instruction for this branch.
3. Unrelated but relevant context living in this branch's history (not part of this roadmap, don't touch without reason): `e4f8102` replaced WKWebView's unreliable `navigator.onLine` with the native `@capacitor/network` status — every Phase A/B screen's `navigator.onLine` check depends on that patch being mounted (`NativeOnlineStatusPatch` in `providers.tsx`) to behave correctly on-device.

## Goal

The user's ask, verbatim: the app should feel exactly as fast as it does offline, **all the time** — online or not. Right now most screens are "network-first, cache as fallback": they show a loading skeleton and wait on a request before rendering anything, only falling back to the IndexedDB read cache (see `project-docs/offline-first-roadmap.md` Phase 3) if that request fails or the device is offline.

The fix is the same on every screen: **cache-first, always**. On mount, read the cache and render it immediately — skip the skeleton entirely if a cache entry exists — then kick off a network fetch in the background (if online) that silently replaces the state once it lands. No visible loading state for a returning user with anything cached, ever, regardless of connectivity. This is standard stale-while-revalidate, just applied consistently instead of only as an offline fallback.

## The pattern (reference implementation)

Already shipped and proven on two screens — copy this shape, don't reinvent it per screen:

- `src/app/(app)/dashboard/page.tsx` (commit `7c725a7` on this branch's parent history, i.e. already on `main`)
- `src/features/workouts/components/workout-history-list.tsx` (same commit)

Shape:
```ts
async function load() {
  const cached = await loadXCache();
  if (cancelled) return;
  if (cached) {
    setState(cached);
    setLoading(false); // or omit if the screen doesn't gate on a loading flag
  }

  if (!navigator.onLine) {
    if (!cached) setFailed(true); // only show an error if there's truly nothing to show
    return;
  }

  try {
    const res = await fetch(...);
    // on success: setState(fresh), void saveXCache(fresh)
    // on failure/non-ok: if (!cached) setFailed(true) — otherwise just leave the cached view up
  } catch {
    if (!cached) setFailed(true);
  }
}
```

Key rules learned from the first two screens — don't skip these:
- **Only show a failure/error state if there's no cache to fall back to.** A failed background refresh with a cache already on screen should be silent — the user is still looking at valid (if slightly stale) data.
- **Don't reset `loading`/`failed` state on every re-run** in a way that re-triggers a skeleton flash when cache is available — check cache first, set state, and only gate the loading UI on the "no cache at all" path.
- Keep the existing `saveXCache` call after a successful fetch — this rollout is about *when* cache gets read (first, not last), not about touching how it gets written.
- Don't touch the underlying cache table schemas (`src/lib/offline/db.ts`) — every screen in Phase A already has a working cache from `project-docs/offline-first-roadmap.md` Phase 3. This is purely a read-order change in the consuming component.

## Phase A — flip already-cached screens to cache-first

These 11 screens already have a working IndexedDB cache (Phase 3) but still gate on the network first. Same mechanical change each time.

- [x] `src/app/(app)/dashboard/page.tsx` — done (already on `main`, predates this branch)
- [x] `src/features/workouts/components/workout-history-list.tsx` — done (already on `main`, predates this branch)
- [x] `src/features/plans/components/plans-list.tsx` — done (commit `983d650`)
- [x] `src/features/plans/components/plan-detail-view.tsx` — done (commit `983d650`); 404 stays authoritative (clears stale cache instead of leaving a deleted plan on screen)
- [x] `src/features/dashboard/components/muscle-heatmap-card.tsx` — done (commit `983d650`)
- [x] `src/features/dashboard/components/achievements-card.tsx` — done (commit `983d650`)
- [x] `src/features/exercises/components/exercise-list.tsx` — done (commit `6e69839`)
- [x] `src/features/tracking/components/body-weight-tracker.tsx` — done (commit `6e69839`); preserved the "pending offline ops → skip network entirely" special case
- [x] `src/features/health/components/health-dashboard.tsx` — done (commit `6b3030b`); cache-first paint skipped specifically for `silent` (background) refreshes, which already have live state on screen and shouldn't regress to a possibly-older cached copy
- [x] `src/features/health/components/sleep-detail.tsx` — done (commit `6b3030b`)
- [x] `src/features/health/components/recovery-detail.tsx` — done (commit `6b3030b`)
- [x] `src/features/health/components/nutrition-detail.tsx` — done (commit `6b3030b`)
- [x] `src/features/workouts/components/exercise-picker-dialog.tsx` — reviewed, **no change made**: it's an on-demand dialog (not a persistent screen) that already branches cleanly on `offlineMode` rather than doing network-first-with-fallback, so there's no skeleton-on-network-wait problem to fix here. Left as-is deliberately, not an oversight.

**Phase A is complete.**

## Phase B — screens with no cache at all yet

These fetched from the network with no offline/cache story whatsoever — worse than Phase A (no fallback at all), and more work per screen (new cache table + save/load helpers, not just a read-order flip).

- [x] `src/features/exercises/components/exercise-detail-view.tsx` — new `exerciseDetailCache` table (keyed by exerciseId)
- [x] `src/features/exercises/components/most-used-exercises-view.tsx` — new `mostUsedExercisesCache` table for the usage list; its detail pane shares `exerciseDetailCache` with the screen above (identical payload shape, same exercise history endpoint)
- [x] `src/features/health/components/cardio-detail.tsx` (fetch actually lives in the page wrapper, `app/(app)/health/cardio/page.tsx`) — reused the existing generic `healthCache` table with a new `"cardio"` key, no schema change
- [x] `src/features/health/components/metric-detail.tsx` — reused `healthCache` with a `"metric-detail"` key (same raw 90-day snapshot payload regardless of which metric slug is being viewed)
- [x] `src/features/tracking/components/body-measurements-tracker.tsx` — new `bodyMeasurementsCache` table; the post-save/delete `load()` refresh also updates the cache, only the initial-mount fetch got the cache-first read order
- [x] Records page (`/records`) — audited: no cache at all, network-only. New `recordsCache` table.

New tables were added in Dexie `version(14)` (`src/lib/offline/db.ts`): `exerciseDetailCache`, `mostUsedExercisesCache`, `bodyMeasurementsCache`, `recordsCache`. Later upgrades brought the schema to **version 16**: v15 added `queueIdMap` for resilient partial queue flushes, and v16 added `previousLogsCache` for offline "last time" hints. Cardio and metric-detail deliberately reuse the generic `healthCache` table (keyed by string).

**Phase B is complete.**

Deliberately excluded from both phases (checked, not applicable):
- `src/app/(app)/workouts/new/page.tsx`, `workout-detail.tsx`, `set-row.tsx` — these aren't read screens, they're the offline *write* flow (Phase 4 of the offline-first roadmap already covers them with its own snapshot/queue mechanism, which is a different and already-solved problem).
- `login-form.tsx`, `register-form.tsx` — meaningless offline (can't authenticate without a network).
- `settings-form.tsx`, `api-keys-card.tsx` — mutation-heavy, low read-traffic, low value for this effort.
- Coach screen — inherently needs a live model call, explicitly out of scope per `project-docs/offline-first-roadmap.md`.

## Verification checklist (do this before considering the branch done)

- [x] `npx tsc --noEmit` clean after each batch of changes (don't wait until the very end to typecheck — catch mistakes early) — done throughout Phase A and Phase B
- [x] `npm run build` (normal Vercel path) still succeeds — verified after Phase A and Phase B
- [x] `npm run build:native` + `npx cap sync ios` succeed — verified after Phase A and Phase B
- [x] In-browser spot check — verified on dashboard + plans list (see Log). Went further than a reload check: logged in, visited dashboard (cache populated), then forced `navigator.onLine = false` via `Object.defineProperty` + dispatched a real `offline` event, then navigated **client-side** (SPA `<a>` click, not a full reload — a full reload would have reset the `onLine` override) to `/dashboard` and `/plans`. Both rendered fully populated instantly with **zero** new network requests fired (confirmed via the request log) — proof it's genuinely cache-first, not just "the local dev server is fast enough to look instant."
- [ ] On-device test: airplane mode, force-quit, relaunch — every screen from both phases should show its last-known data instantly, same as Phase 3 already established, but now ALSO true when online. Still needed — the in-browser check above proves the logic works, but not the native WKWebView/IndexedDB path specifically. Phase B's new IndexedDB tables (Dexie version bump to 14) also need a real-device confirmation that the upgrade runs cleanly on an existing installed app.
- [ ] Only after all of the above: merge to `main` following the same process every other phase in this repo has used (`git checkout main`, `git merge --no-ff`, `tsc --noEmit` again, `git push origin main`) — **do this only when explicitly asked**, per the user's instruction for this branch.

## Log

- 2026-07-12: Roadmap created. Proof-of-concept already shipped on `main` for `dashboard/page.tsx` and `workout-history-list.tsx` (same session, just before this branch was cut) — this doc formalizes rolling the same pattern out to the other 11 already-cached screens (Phase A) and, after that, to the 6 screens with no cache at all yet (Phase B). Branch `feature/instant-load-cache-first` created off `main`; per explicit user instruction, nothing gets committed to `main` again until this entire effort is reviewed and the user asks for the merge.
- 2026-07-12: Phase A completed — all 11 remaining screens flipped to cache-first across 3 commits (`983d650` plans list/detail + muscle heatmap + achievements, `6e69839` exercise list + body-weight tracker, `6b3030b` health dashboard + sleep/recovery/nutrition detail). Reviewed `exercise-picker-dialog.tsx` and deliberately left it unchanged (on-demand dialog, already branches cleanly, no skeleton-wait problem to fix). Two special cases preserved carefully rather than blindly templated: `plan-detail-view.tsx`'s 404 stays authoritative (clears a stale cache instead of showing a deleted plan), and `body-weight-tracker.tsx`'s "pending offline ops" case still skips the background network fetch entirely (not just defers it) to avoid clobbering the correct optimistic local view with a stale server one. `tsc --noEmit`, `npm run build`, and `npm run sync:native` all verified clean after the full batch. Not yet spot-checked in-browser or on-device — that's the next step before Phase B starts.
- 2026-07-12: In-browser verification done. Created a temp test user with a plan + completed workout, logged in via the local dev server, visited `/dashboard` (populating `dashboardCache`), then simulated a real offline transition (`navigator.onLine` override + `offline` event) and navigated client-side (not a full reload, which would've reset the override) to `/dashboard` and `/plans`. Both rendered fully instantly with the request log confirming zero new network calls — this is the strongest available proof short of an actual device that the cache-first paint is real and not just "localhost is fast." Test user cleaned up afterward. On-device verification is the only remaining item before Phase B can start.
- 2026-07-12: Phase B completed. Added 4 new Dexie tables (`exerciseDetailCache`, `mostUsedExercisesCache`, `bodyMeasurementsCache`, `recordsCache`, version bump to 14) and flipped all 6 listed screens to cache-first. Reused the existing generic `healthCache` table (new `"cardio"` and `"metric-detail"` keys) for cardio and metric-detail instead of adding two more single-purpose tables. `most-used-exercises-view.tsx`'s detail pane shares `exerciseDetailCache` with `exercise-detail-view.tsx` — same underlying exercise-history payload, so a click-through from one screen to the other can already be warm. `tsc --noEmit`, `npm run build`, and `npm run build:native` + `npx cap sync ios` all verified clean. Also confirmed while working: the app's earlier "thinks it's offline" symptom the user hit was already fixed further back in this branch's history by two prior commits — `efb519a` (18 API routes were cookie-only `auth()`, ignoring the native Bearer token, so requests 401'd even when genuinely online) and `e4f8102` (WKWebView's `navigator.onLine` is unreliable — replaced with the real `@capacitor/network` status via `NativeOnlineStatusPatch`). Both phases' screens depend on that patch to read `navigator.onLine` correctly on-device. On-device verification (both phases) is the only remaining item before this branch can be considered for merge.
- 2026-07-13: Added close-out hardening. Orphaned workout queue rows are pruned silently and delete/cancel paths purge queue, id maps, and snapshots together; post-workout rekeying is transactional. A signed-in online client warms `previousLogsCache` from a new bulk route so offline exercise rows can show prior weight/reps. Native HealthKit now requests 90 days, falls back to iPhone/all-source cumulative data on no-Watch days, reads VO₂max and nutrition/macros, syncs hourly in the foreground, and requests a best-effort hourly iOS background refresh (iOS does not guarantee the cadence).
