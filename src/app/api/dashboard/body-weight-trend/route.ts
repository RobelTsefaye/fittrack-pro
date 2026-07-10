import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getBodyWeightTrend } from "@/features/dashboard/queries";

export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const take = Math.min(
    60,
    Math.max(2, parseInt(req.nextUrl.searchParams.get("limit") ?? "14", 10))
  );

  const data = await getBodyWeightTrend(userId, take);
  return NextResponse.json({ data });
}
