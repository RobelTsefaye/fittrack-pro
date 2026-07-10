"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { NutritionDetail } from "@/features/health/components/nutrition-detail";
import type { HealthSnapshot } from "@/features/health/types";

export default function NutritionPage() {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch("/api/health-data?limit=1", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data) setSnapshot(json.data.at(-1) ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RequireAuth>
      <NutritionDetail initialSnapshot={snapshot} />
    </RequireAuth>
  );
}
