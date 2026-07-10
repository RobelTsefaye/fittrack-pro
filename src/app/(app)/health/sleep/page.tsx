"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { SleepDetail } from "@/features/health/components/sleep-detail";
import type { HealthSnapshot } from "@/features/health/types";

export default function SleepPage() {
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>([]);

  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch("/api/health-data?limit=90", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data) setSnapshots(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RequireAuth>
      <SleepDetail initialSnapshots={snapshots} />
    </RequireAuth>
  );
}
