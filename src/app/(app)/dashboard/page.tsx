"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { APP_NAME } from "@/lib/constants";
import { DashboardAnalytics } from "@/features/dashboard/components/dashboard-analytics";
import { MuscleHeatmapCard } from "@/features/dashboard/components/muscle-heatmap-card";
import { AchievementsCard } from "@/features/dashboard/components/achievements-card";
import { DashboardPageSkeleton } from "./dashboard-page-skeleton";
import type { DashboardClientPayload } from "@/features/dashboard/queries";
import { saveDashboardCache, loadDashboardCache } from "@/lib/offline/screen-caches";
import { saveCachedUser } from "@/lib/cached-user";
import { syncNextWorkoutWidgetSnapshot } from "@/lib/native/shared-data";

type DashboardState = {
  weightUnit: "KG" | "LB";
  /** Provided by /api/dashboard/client-payload — the reliable name source on
   *  native, where the cookie session behind useSession() can silently die
   *  (see cached-user.ts). Optional: cached payloads predating this field. */
  userName?: string | null;
  payload: DashboardClientPayload;
};

// Client component — no server-side auth()/data-fetching (see
// project-docs/offline-first-roadmap.md Phase 2). Fetches the new
// /api/dashboard/client-payload route, which bundles what
// getDashboardClientPayload + a settings lookup used to do server-side.
// AchievementsCard and MuscleHeatmapCard were themselves async Server
// Components (Suspense-streamed) — both converted separately to fetch their
// own data client-side, so they're rendered directly here instead of wrapped
// in Suspense.
export default function DashboardPage() {
  const { data: session } = useSession();
  const [state, setState] = useState<DashboardState | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    document.title = `Dashboard — ${APP_NAME}`;
    let cancelled = false;
    setFailed(false);

    async function load() {
      // Cache-first, always — even online. Paints the last-known dashboard
      // instantly (no skeleton wait) instead of blocking on the network,
      // then a fresh fetch below quietly replaces it once it lands. This is
      // what makes the app feel "as fast as offline" all the time, not just
      // when actually offline.
      const cached = await loadDashboardCache<DashboardState>();
      if (cancelled) return;
      if (cached) setState(cached);

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!cached) setFailed(true);
        return;
      }
      try {
        const res = await authenticatedFetch("/api/dashboard/client-payload", { credentials: "include" });
        const json = res.ok ? await res.json() : null;
        if (cancelled) return;
        if (json?.data) {
          setState(json.data);
          void saveDashboardCache(json.data);
          void syncNextWorkoutWidgetSnapshot(
            json.data.payload.summary.workoutStreakDays,
            json.data.payload.nextSession?.sessionName ?? null,
            json.data.payload.nextSession?.planName ?? null
          );
          // Keep the display identity fresh for screens that can't rely on
          // the cookie session (More-page profile) — see cached-user.ts.
          if (json.data.userName) saveCachedUser({ name: json.data.userName });
        } else if (!cached) {
          setFailed(true);
        }
      } catch {
        if (!cached) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  return (
    <RequireAuth>
      {state == null && failed ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-[var(--sys-label2)]">Dashboard konnte nicht geladen werden.</p>
          <button
            type="button"
            onClick={() => setRetryCount((n) => n + 1)}
            className="text-sm font-medium text-primary"
          >
            Erneut versuchen
          </button>
        </div>
      ) : state == null ? (
        <DashboardPageSkeleton />
      ) : (
        <div className="space-y-6">
          <DashboardAnalytics
            userName={state.userName ?? session?.user?.name}
            weightUnit={state.weightUnit}
            payload={state.payload}
          />
          <AchievementsCard />
          <MuscleHeatmapCard />
        </div>
      )}
    </RequireAuth>
  );
}
