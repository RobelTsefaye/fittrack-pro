"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { BackButton } from "@/components/layout/back-button";
import { BodyTrackingShell } from "@/features/tracking/components/body-tracking-shell";
import type { WeightUnit } from "@/generated/prisma/enums";

export default function BodyWeightPage() {
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("KG");

  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch("/api/settings", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data?.weightUnit) setWeightUnit(json.data.weightUnit);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RequireAuth>
      <BackButton />
      <BodyTrackingShell weightUnit={weightUnit} />
    </RequireAuth>
  );
}
