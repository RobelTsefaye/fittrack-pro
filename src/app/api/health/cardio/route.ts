import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getCardioSummary } from "@/features/health/cardio";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await getCardioSummary(userId);
  return NextResponse.json({ data });
}
