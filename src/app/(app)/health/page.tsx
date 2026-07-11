"use client";

import { RequireAuth } from "@/components/auth/require-auth";
import { BackButton } from "@/components/layout/back-button";
import { HealthDashboard } from "@/features/health/components/health-dashboard";

// HealthDashboard fetches its own data client-side (via the patched fetch →
// production API). Passing it initial props here was actively harmful: the page
// seeded them with empty arrays, and HealthDashboard treats a non-null (but
// empty) `initialSnapshots` as "server already provided data," so it skipped
// its own fetch and rendered the empty "no health data" state forever. Not
// passing anything lets it load normally — same pattern as ExercisesPage
// (project-docs/offline-first-roadmap.md Phase 2).
export default function HealthPage() {
  return (
    <RequireAuth>
      <BackButton />
      <HealthDashboard />
    </RequireAuth>
  );
}
