"use client";

import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { ExerciseList } from "@/features/exercises/components/exercise-list";
import { ExerciseFilters } from "@/features/exercises/components/exercise-filters";
import { BackButton } from "@/components/layout/back-button";

// Client component — no server-side auth()/searchParams/data-fetching (see
// project-docs/offline-first-roadmap.md Phase 2). No SSR prefetch of the
// exercise list either: ExerciseList already falls back to its own client
// fetch whenever `initialExercises` isn't provided, and ExerciseFilters
// already reads/writes the query string itself via useSearchParams — so
// simply not passing server-prefetched props here is enough, nothing else
// needs converting.
export default function ExercisesPage() {
  return (
    <RequireAuth>
      <div className="space-y-4">
        <BackButton />
        <Suspense>
          <ExerciseFilters />
          <ExerciseList />
        </Suspense>
      </div>
    </RequireAuth>
  );
}
