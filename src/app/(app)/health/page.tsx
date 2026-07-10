"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { BackButton } from "@/components/layout/back-button";
import { HealthDashboard } from "@/features/health/components/health-dashboard";
import type { HealthSnapshot } from "@/features/health/types";
import type { RecoveryBreakdown } from "@/features/health/recovery";
import type { CardioSummary } from "@/features/health/cardio";

export default function HealthPage() {
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>([]);
  const [recovery, setRecovery] = useState<RecoveryBreakdown | null>(null);
  const [cardio, setCardio] = useState<CardioSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      authenticatedFetch("/api/health-data?limit=30", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      authenticatedFetch("/api/health/recovery", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      authenticatedFetch("/api/health/cardio", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([snapshotsJson, recoveryJson, cardioJson]) => {
      if (cancelled) return;
      if (snapshotsJson?.data) setSnapshots(snapshotsJson.data);
      if (recoveryJson?.data !== undefined) setRecovery(recoveryJson.data);
      if (cardioJson?.data !== undefined) setCardio(cardioJson.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RequireAuth>
      <BackButton />
      <HealthDashboard
        initialSnapshots={snapshots}
        initialRecovery={recovery}
        initialCardio={cardio}
      />
    </RequireAuth>
  );
}
