"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { RecoveryDetail } from "@/features/health/components/recovery-detail";
import type { RecoveryBreakdown, RecoveryHistoryPoint } from "@/features/health/recovery";

export default function RecoveryPage() {
  const [recovery, setRecovery] = useState<RecoveryBreakdown | null>(null);
  const [history, setHistory] = useState<RecoveryHistoryPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch("/api/health/recovery", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        if (json.data !== undefined) setRecovery(json.data);
        if (json.history) setHistory(json.history);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RequireAuth>
      <RecoveryDetail initialRecovery={recovery} initialHistory={history} />
    </RequireAuth>
  );
}
