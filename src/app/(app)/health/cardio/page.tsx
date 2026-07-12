"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { CardioDetail } from "@/features/health/components/cardio-detail";
import type { CardioSummary } from "@/features/health/cardio";
import { saveHealthCache, loadHealthCache } from "@/lib/offline/screen-caches";

export default function CardioPage() {
  const [summary, setSummary] = useState<CardioSummary | null>(null);

  // Cache-first (project-docs/instant-load-roadmap.md Phase B): paint the
  // last-known summary immediately, then silently refresh in the background.
  // Reuses the generic `healthCache` table (keyed "cardio") — no schema
  // change needed, same table sleep/recovery/nutrition already use.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadHealthCache<CardioSummary>("cardio");
      if (!cancelled && cached) setSummary(cached);

      void authenticatedFetch("/api/health/cardio", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (cancelled) return;
          if (json?.data) {
            setSummary(json.data);
            void saveHealthCache("cardio", json.data);
          }
        })
        .catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RequireAuth>
      {summary && <CardioDetail summary={summary} />}
    </RequireAuth>
  );
}
