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
  const [state, setState] = useState<{ weightUnit: "KG" | "LB"; payload: DashboardClientPayload } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    document.title = `Dashboard — ${APP_NAME}`;
    let cancelled = false;
    setFailed(false);
    void authenticatedFetch("/api/dashboard/client-payload", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        if (json?.data) setState(json.data);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
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
            userName={session?.user?.name}
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
