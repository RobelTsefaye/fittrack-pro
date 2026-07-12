"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { APP_NAME } from "@/lib/constants";
import { BackButton } from "@/components/layout/back-button";
import { RecordsView } from "@/features/records/components/records-view";
import type { PREntry, Achievement } from "@/services/personal-records";
import { saveRecordsCache, loadRecordsCache } from "@/lib/offline/screen-caches";

type RecordsData = {
  records: PREntry[];
  achievements: Achievement[];
  weightUnit: string;
  streak: number;
  totalWorkouts: number;
  totalPRs: number;
};

// Client component — no server-side auth()/data-fetching (see
// project-docs/offline-first-roadmap.md Phase 2). Fetches the new /api/records
// route, which bundles what used to be three separate server-side calls plus
// a direct settings lookup — no existing route returned all of it together.
export default function RecordsPage() {
  const [data, setData] = useState<RecordsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Cache-first (project-docs/instant-load-roadmap.md Phase B): paint the
  // last-known payload immediately, then silently refresh in the background.
  // Only show the failure state when there's truly nothing cached.
  useEffect(() => {
    document.title = `Personal Records — ${APP_NAME}`;
    let cancelled = false;
    setFailed(false);
    (async () => {
      const cached = await loadRecordsCache<RecordsData>();
      if (!cancelled && cached) setData(cached);

      void authenticatedFetch("/api/records", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (cancelled) return;
          if (json?.data) {
            setData(json.data);
            void saveRecordsCache(json.data);
          } else if (!cached) {
            setFailed(true);
          }
        })
        .catch(() => {
          if (!cancelled && !cached) setFailed(true);
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  if (!data && failed) {
    return (
      <RequireAuth>
        <BackButton />
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-[var(--sys-label2)]">Records konnten nicht geladen werden.</p>
          <button
            type="button"
            onClick={() => setRetryCount((n) => n + 1)}
            className="text-sm font-medium text-primary"
          >
            Erneut versuchen
          </button>
        </div>
      </RequireAuth>
    );
  }

  if (!data) return null;

  return (
    <RequireAuth>
      <BackButton />
      <RecordsView
        records={data.records}
        achievements={data.achievements}
        weightUnit={data.weightUnit}
        streak={data.streak}
        totalWorkouts={data.totalWorkouts}
        totalPRs={data.totalPRs}
      />
    </RequireAuth>
  );
}
