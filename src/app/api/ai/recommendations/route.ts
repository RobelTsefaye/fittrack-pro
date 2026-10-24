import { NextResponse } from "next/server";
import { buildHeuristicRecommendations } from "@/features/ai/context";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET() {
  const userId = await requireUserId();

  const items = await buildHeuristicRecommendations(userId);

  return NextResponse.json({
    data: {
      schemaVersion: "1.0",
      kind: "recommendations",
      generatedAt: new Date().toISOString(),
      source: "heuristic",
      note:
        "Rule-based suggestions from your logs, not a medical opinion. Replace or augment with an LLM using /api/ai/training-summary and /api/ai/progress-report.",
      items,
    },
    meta: { endpoint: "recommendations", count: items.length },
  });
});
