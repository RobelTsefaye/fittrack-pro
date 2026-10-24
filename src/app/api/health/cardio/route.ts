import { NextResponse } from "next/server";
import { getCardioSummary } from "@/features/health/cardio";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const dynamic = "force-dynamic";

export const GET = withApi(async function GET() {
  const userId = await requireUserId();
  const data = await getCardioSummary(userId);
  return NextResponse.json({ data });
});
