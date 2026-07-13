"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import type { PreviousLogEntry } from "@/features/workouts/previous-logs-types";
import { savePreviousLogsCache } from "@/lib/offline/screen-caches";

/** Opportunistically seeds all prior exercise logs while online, rather than
 * waiting until each exercise happens to appear in an active workout. */
export function PreviousLogsCacheWarmer() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

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
  }, [status]);

  return null;
}
