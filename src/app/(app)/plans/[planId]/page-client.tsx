"use client";

import { useParams, useSearchParams } from "next/navigation";
import { PlanDetailView } from "@/features/plans/components/plan-detail-view";

export function PlanDetailPageClient() {
  const params = useParams<{ planId: string }>();
  const searchParams = useSearchParams();
  // Native navigates here via planHref(), which passes the real id as
  // ?id=... against the pre-rendered placeholder path (see workout-href.ts);
  // the web build still uses the clean /plans/<id> path param directly.
  const planId = searchParams.get("id") ?? params.planId;
  return <PlanDetailView planId={planId} />;
}
