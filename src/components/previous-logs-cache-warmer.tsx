"use client";

import { useEffect } from "react";
import type { PreviousLogEntry } from "@/features/workouts/previous-logs-types";
import { savePreviousLogsCache } from "@/lib/offline/screen-caches";

/** Opportunistically seeds all prior exercise logs while online, rather than
 * waiting until each exercise happens to appear in an active workout.
 *
 * Deliberately has no auth-status gate at all: useSession().status is a
 * cookie-backed session that's only best-effort synced on native and can
 * silently die while the actual Bearer-token login stays valid (see
 * project-docs/offline-first-roadmap.md Phase 2) — gating on it stopped this
 * warmer from ever running for an affected user. The fetch below is
 * self-guarding instead (NativeAuthFetchPatch attaches the real token
 * automatically; an unauthenticated request just 401s and `!response.ok`
 * bails), so there's nothing to check upfront. */
export function PreviousLogsCacheWarmer() {
  useEffect(() => {
    let cancelled = false;
    async function warm() {
      if (typeof navigator === "undefined" || !navigator.onLine) return;
      try {
        const response = await fetch("/api/workouts/previous-logs-all", { credentials: "include" });
        if (!response.ok) return;
        const json = (await response.json()) as { data?: Record<string, PreviousLogEntry> };
        if (!cancelled && json.data) await savePreviousLogsCache(json.data);
      } catch {
        // Offline cache warming is strictly best-effort.
      }
    }

    void warm();
    window.addEventListener("online", warm);
    return () => {
      cancelled = true;
      window.removeEventListener("online", warm);
    };
  }, []);

  return null;
}
