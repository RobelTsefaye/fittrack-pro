"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { WorkoutDetail } from "@/features/workouts/components/workout-detail";
import type { WorkoutData } from "@/features/workouts/workout-types";
import { SettingsCacher } from "./settings-cacher";
import { DEFAULT_REST_TIMER } from "@/lib/constants";

export function WorkoutPageClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  // Native navigates here via workoutHref(), which passes the real id as
  // ?id=... against the pre-rendered placeholder path (see workout-href.ts);
  // the web build still uses the clean /workouts/<id> path param directly.
  const id = searchParams.get("id") ?? params.id;
  const [initialWorkout, setInitialWorkout] = useState<WorkoutData | null>(null);
  const [weightUnit, setWeightUnit] = useState<"KG" | "LB">("KG");
  const [restTimerDefault, setRestTimerDefault] = useState(DEFAULT_REST_TIMER);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      authenticatedFetch(`/api/workouts/${id}`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      authenticatedFetch("/api/settings", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([workoutJson, settingsJson]) => {
      if (cancelled) return;
      if (workoutJson?.data) {
        setInitialWorkout(workoutJson.data);
        if (typeof workoutJson.data.restTimerDefaultSeconds === "number") {
          setRestTimerDefault(workoutJson.data.restTimerDefaultSeconds);
        }
      }
      if (settingsJson?.data?.weightUnit) setWeightUnit(settingsJson.data.weightUnit);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <RequireAuth>
      {/* Cache settings in localStorage so offline workout start can read them */}
      <SettingsCacher weightUnit={weightUnit} restTimerDefault={restTimerDefault} />
      <WorkoutDetail
        workoutId={id}
        defaultRestSeconds={restTimerDefault}
        weightUnit={weightUnit}
        initialWorkout={initialWorkout}
      />
    </RequireAuth>
  );
}
