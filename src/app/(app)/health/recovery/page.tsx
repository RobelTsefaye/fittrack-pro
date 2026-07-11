"use client";

import { RequireAuth } from "@/components/auth/require-auth";
import { RecoveryDetail } from "@/features/health/components/recovery-detail";

// RecoveryDetail self-fetches when no initial props are given. Passing
// initialRecovery={null} made it treat "not loaded yet" as "data already
// provided" (null !== undefined) and skip its own fetch
// (project-docs/offline-first-roadmap.md Phase 2).
export default function RecoveryPage() {
  return (
    <RequireAuth>
      <RecoveryDetail />
    </RequireAuth>
  );
}
