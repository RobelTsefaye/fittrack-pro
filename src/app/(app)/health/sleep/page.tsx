"use client";

import { RequireAuth } from "@/components/auth/require-auth";
import { SleepDetail } from "@/features/health/components/sleep-detail";

// SleepDetail self-fetches when no initial props are given. Passing an empty
// initialSnapshots array made it treat "no data" as "data already provided"
// and skip its own fetch (project-docs/offline-first-roadmap.md Phase 2).
export default function SleepPage() {
  return (
    <RequireAuth>
      <SleepDetail />
    </RequireAuth>
  );
}
