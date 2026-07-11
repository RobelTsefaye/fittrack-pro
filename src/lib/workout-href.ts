import { Capacitor } from "@capacitor/core";

/**
 * URL for a specific workout's detail page. On native, the static export
 * only pre-renders a placeholder param for `/workouts/[id]` (see
 * project-docs/offline-first-roadmap.md Phase 2), so a client-side
 * navigation straight to `/workouts/<realId>` can't resolve an RSC payload
 * and Next falls back to a full WebView reload. Routing through the
 * pre-rendered placeholder with the id as a query param avoids that reload
 * entirely; page-client.tsx reads it from there. The web build keeps the
 * clean path-based URL since its server can resolve any id directly.
 */
export function workoutHref(id: string) {
  if (Capacitor.isNativePlatform()) {
    return `/workouts/_?id=${id}`;
  }
  return `/workouts/${id}`;
}

/**
 * Same problem as `workoutHref` above, for `/plans/[planId]` — the static
 * export only pre-renders `/plans/_`, so a real plan id has no matching file
 * on native and falls back to a full reload (which lands on the SPA's root
 * route and, for a logged-in user, redirects straight to the dashboard).
 */
export function planHref(id: string) {
  if (Capacitor.isNativePlatform()) {
    return `/plans/_?id=${id}`;
  }
  return `/plans/${id}`;
}
