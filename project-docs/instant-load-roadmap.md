# Instant-Load Roadmap (cache-first everywhere)

**Branch:** `feature/instant-load-cache-first` — nothing lands on `main` until the whole rollout is done and verified on-device. Every commit for this effort goes on this branch only.
**Status:** Phase A complete (13/13 screens, 2 predating this branch on `main`). `npx tsc --noEmit`, `npm run build`, and `npm run sync:native` all clean. Phase B not started. On-device verification not yet done.
**Last updated:** 2026-07-12

## ⏭️ Resume here (next session)

1. Phase A is done in code and typechecks/builds clean, but **not yet spot-checked in-browser or on-device** — do that before starting Phase B (see the Verification checklist below; specifically the in-browser reload check and the on-device airplane-mode relaunch check).
2. After that passes, start Phase B (screens with no cache at all yet — see that section below). Each Phase B screen needs a new cache table in `src/lib/offline/db.ts` + save/load helpers in `screen-caches.ts` (bump the Dexie version, same pattern as `planDetailCache` in `project-docs/offline-first-roadmap.md` Phase 4-follow-up) before it can even get the cache-first read-order treatment — more work per screen than Phase A was.
3. This is all on `feature/instant-load-cache-first`. **Do not merge to `main`** until the user explicitly asks, per their original instruction for this branch.

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

## Phase B — screens with no cache at all yet (lower priority, do after Phase A)

These fetch from the network with no offline/cache story whatsoever today — worse than Phase A (they don't even have a fallback), but also more work per screen (need a new cache table + save/load helpers in `src/lib/offline/screen-caches.ts` and `db.ts`, not just a read-order flip). Don't start these until Phase A is fully done and verified.

- [ ] `src/features/exercises/components/exercise-detail-view.tsx` (single exercise detail + history)
- [ ] `src/features/exercises/components/most-used-exercises-view.tsx`
- [ ] `src/features/health/components/cardio-detail.tsx`
- [ ] `src/features/health/components/metric-detail.tsx` (generic health metric drill-down)
- [ ] `src/features/tracking/components/body-measurements-tracker.tsx`
- [ ] Records page (`/records`) — confirm current data-loading approach before scoping; not yet audited as of this writing.

Deliberately excluded from both phases (checked, not applicable):
- `src/app/(app)/workouts/new/page.tsx`, `workout-detail.tsx`, `set-row.tsx` — these aren't read screens, they're the offline *write* flow (Phase 4 of the offline-first roadmap already covers them with its own snapshot/queue mechanism, which is a different and already-solved problem).
- `login-form.tsx`, `register-form.tsx` — meaningless offline (can't authenticate without a network).
- `settings-form.tsx`, `api-keys-card.tsx` — mutation-heavy, low read-traffic, low value for this effort.
- Coach screen — inherently needs a live model call, explicitly out of scope per `project-docs/offline-first-roadmap.md`.

## Verification checklist (do this before considering the branch done)

- [x] `npx tsc --noEmit` clean after each batch of changes (don't wait until the very end to typecheck — catch mistakes early) — done throughout Phase A
- [x] `npm run build` (normal Vercel path) still succeeds — verified after Phase A
- [x] `npm run build:native` + `npm run sync:native` succeed — verified after Phase A
- [ ] In-browser spot check on at least 3 of the migrated screens: visit once online (populates cache), reload — confirm the screen renders with data **immediately**, no skeleton flash, before checking Network tab confirms a background request still fires
- [ ] On-device test: airplane mode, force-quit, relaunch — every Phase A screen should show its last-known data instantly, same as Phase 3 already established, but now ALSO true when online
- [ ] Only after all of the above: merge to `main` following the same process every other phase in this repo has used (`git checkout main`, `git merge --no-ff`, `tsc --noEmit` again, `git push origin main`) — **do this only when explicitly asked**, per the user's instruction for this branch.

## Log

- 2026-07-12: Roadmap created. Proof-of-concept already shipped on `main` for `dashboard/page.tsx` and `workout-history-list.tsx` (same session, just before this branch was cut) — this doc formalizes rolling the same pattern out to the other 11 already-cached screens (Phase A) and, after that, to the 6 screens with no cache at all yet (Phase B). Branch `feature/instant-load-cache-first` created off `main`; per explicit user instruction, nothing gets committed to `main` again until this entire effort is reviewed and the user asks for the merge.
- 2026-07-12: Phase A completed — all 11 remaining screens flipped to cache-first across 3 commits (`983d650` plans list/detail + muscle heatmap + achievements, `6e69839` exercise list + body-weight tracker, `6b3030b` health dashboard + sleep/recovery/nutrition detail). Reviewed `exercise-picker-dialog.tsx` and deliberately left it unchanged (on-demand dialog, already branches cleanly, no skeleton-wait problem to fix). Two special cases preserved carefully rather than blindly templated: `plan-detail-view.tsx`'s 404 stays authoritative (clears a stale cache instead of showing a deleted plan), and `body-weight-tracker.tsx`'s "pending offline ops" case still skips the background network fetch entirely (not just defers it) to avoid clobbering the correct optimistic local view with a stale server one. `tsc --noEmit`, `npm run build`, and `npm run sync:native` all verified clean after the full batch. Not yet spot-checked in-browser or on-device — that's the next step before Phase B starts.
