import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getCardioSummary } from "@/features/health/cardio";

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
