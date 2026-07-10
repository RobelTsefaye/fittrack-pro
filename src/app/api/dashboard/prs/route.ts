import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getRecentPersonalRecords } from "@/features/dashboard/queries";

export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
