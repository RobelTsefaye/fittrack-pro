import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getWeightTrend } from "@/features/health/weight-trend";

// Read-only — never mutates. "Accepting" a suggestion goes through
// POST /api/nutrition-plan, triggered by an explicit user click.
export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getWeightTrend(userId);
  return NextResponse.json({ data });
}
