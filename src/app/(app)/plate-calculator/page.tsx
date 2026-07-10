"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { BackButton } from "@/components/layout/back-button";
import { PlateCalculator } from "@/features/tools/components/plate-calculator";
import type { WeightUnit } from "@/generated/prisma/enums";

// Client component — no server-side auth()/data-fetching. A statically-
// exported build (project-docs/offline-first-roadmap.md Phase 2) pre-renders
// pages once at build time, not per-request; RequireAuth + this component's
// own fetch replace what the server component used to do. `metadata` export
// (server-only) is dropped along with it — see health/[metric]/page.tsx for
// where a per-page <title> still matters enough to set via a client effect.
export default function PlateCalculatorPage() {
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
      <div className="space-y-5">
        <BackButton />
        <div className="shrink-0">
          <h1 className="page-title leading-none">Plate Calculator</h1>
          <p className="mt-1 text-sm text-[var(--sys-label2)]">
            Load your barbell in seconds
          </p>
        </div>
        <PlateCalculator defaultUnit={weightUnit} />
      </div>
    </RequireAuth>
  );
}
