"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { ExerciseDetailView } from "@/features/exercises/components/exercise-detail-view";
import type { WeightUnit } from "@/generated/prisma/enums";

export function ExerciseDetailPageClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  // Native navigates here via exercisePath(), which passes the real id as
  // ?id=... against the pre-rendered placeholder path (see constants.ts);
  // the web build still uses the clean /exercises/<id> path param directly.
  const id = searchParams.get("id") ?? params.id;
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("KG");

  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch("/api/settings", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data?.weightUnit) setWeightUnit(json.data.weightUnit);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RequireAuth>
      <ExerciseDetailView exerciseId={id} weightUnit={weightUnit} />
    </RequireAuth>
  );
}
