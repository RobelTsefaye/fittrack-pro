import { NextResponse } from "next/server";
import { getCardioSummary } from "@/features/health/cardio";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET() {
  const userId = await requireUserId();

  const summary = await getCardioSummary(userId);

  return NextResponse.json({
    data: {
      schemaVersion: "1.0",
      kind: "cardio-history",
      generatedAt: new Date().toISOString(),
      ...summary,
    },
    meta: { endpoint: "cardio-history" },
  });
});
