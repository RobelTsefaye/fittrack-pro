"use client";

import { RequireAuth } from "@/components/auth/require-auth";
import { WorkoutHistoryList } from "@/features/workouts/components/workout-history-list";

// WorkoutHistoryList owns its own fetch (cache-then-network via
// src/lib/offline/db.ts's workoutListCache, same pattern as
// body-weight-tracker.tsx) and its own loading skeleton — this page used to
// duplicate that with a separate network-only fetch that had no cache
// fallback, so it just stayed on WorkoutsPageSkeleton forever whenever
// offline. See project-docs/offline-first-roadmap.md Phase 3.
export default function WorkoutsPage() {
  return (
    <RequireAuth>
      <WorkoutHistoryList />
    </RequireAuth>
  );
}
