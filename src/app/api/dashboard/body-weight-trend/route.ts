import { NextRequest, NextResponse } from "next/server";
import { getBodyWeightTrend } from "@/features/dashboard/queries";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET(req: NextRequest) {
  const userId = await requireUserId();

  const take = Math.min(
    60,
    Math.max(2, parseInt(req.nextUrl.searchParams.get("limit") ?? "14", 10))
  );

  const data = await getBodyWeightTrend(userId, take);
  return NextResponse.json({ data });
});
