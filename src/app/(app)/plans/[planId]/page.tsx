import { PlanDetailView } from "@/features/plans/components/plan-detail-view";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  return <PlanDetailView planId={planId} />;
}
