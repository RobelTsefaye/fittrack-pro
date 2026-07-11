"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * Drop-in replacement for `next/link` that defaults `prefetch` to `false`.
 *
 * In the native static export (project-docs/offline-first-roadmap.md Phase 2)
 * the app is served from `capacitor://localhost`. Next.js's App Router
 * prefetch fetches an RSC payload variant for each in-viewport Link; over the
 * capacitor scheme that prefetch resolves to something the router can't use,
 * and it poisons the client cache so the actual tap then silently does
 * nothing — navigation to any prefetched route (Workouts, Health, …) just
 * didn't happen, while non-prefetched navigation (`router.push`, the More tab)
 * worked fine. Confirmed on-device via a click/route probe: taps registered,
 * the route never changed. Prefetch buys essentially nothing here anyway —
 * every route is already a local bundled file, no network round trip to warm.
 *
 * Callers that genuinely want prefetch can still pass `prefetch` explicitly;
 * it overrides this default.
 */
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}
