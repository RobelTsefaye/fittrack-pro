"use client";

import { useParams } from "next/navigation";
import { PlanDetailView } from "@/features/plans/components/plan-detail-view";

export function PlanDetailPageClient() {
  const { planId } = useParams<{ planId: string }>();
  return <PlanDetailView planId={planId} />;
}
