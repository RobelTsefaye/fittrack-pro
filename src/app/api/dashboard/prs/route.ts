import { NextRequest, NextResponse } from "next/server";
import { getRecentPersonalRecords } from "@/features/dashboard/queries";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET(req: NextRequest) {
  const userId = await requireUserId();

  const take = Math.min(
    50,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10))
  );

  const rows = await getRecentPersonalRecords(userId, take);
  const data = rows.map((pr) => ({
    id: pr.id,
    exercise: pr.exercise,
    weight: pr.weight,
    reps: pr.reps,
    estimated1RM: pr.estimated1RM,
    achievedAt: pr.achievedAt.toISOString(),
  }));

  return NextResponse.json({ data });
});
