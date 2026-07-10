"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { WorkoutHistoryList } from "@/features/workouts/components/workout-history-list";
import { WorkoutsPageSkeleton } from "./workouts-page-skeleton";
import type { WorkoutListItemDTO } from "@/features/workouts/workouts-list-data";

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<WorkoutListItemDTO[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch("/api/workouts", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data) setWorkouts(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RequireAuth>
      {workouts === null ? (
        <WorkoutsPageSkeleton />
      ) : (
        <WorkoutHistoryList initialWorkouts={workouts} />
      )}
    </RequireAuth>
  );
}
