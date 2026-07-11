"use client";

import { RequireAuth } from "@/components/auth/require-auth";
import { NutritionDetail } from "@/features/health/components/nutrition-detail";

// NutritionDetail self-fetches when no initial props are given. Passing
// initialSnapshot={null} made it treat "not loaded yet" as "data already
// provided" (null !== undefined) and skip its own fetch
// (project-docs/offline-first-roadmap.md Phase 2).
export default function NutritionPage() {
  return (
    <RequireAuth>
      <NutritionDetail />
    </RequireAuth>
  );
}
