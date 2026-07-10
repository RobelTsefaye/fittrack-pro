"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { CardioDetail } from "@/features/health/components/cardio-detail";
import type { CardioSummary } from "@/features/health/cardio";

export default function CardioPage() {
  const [summary, setSummary] = useState<CardioSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch("/api/health/cardio", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data) setSummary(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RequireAuth>
      {summary && <CardioDetail summary={summary} />}
    </RequireAuth>
  );
}
