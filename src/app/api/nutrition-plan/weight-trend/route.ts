import { NextRequest, NextResponse } from "next/server";
import { getWeightTrend, DISPLAY_WINDOW_OPTIONS } from "@/features/health/weight-trend";
import { requireUserId, withApi } from "@/lib/api/route-handler";

// Read-only — never mutates. "Accepting" a suggestion goes through
// POST /api/nutrition-plan, triggered by an explicit user click.
export const GET = withApi(async function GET(req: NextRequest) {
  const userId = await requireUserId();

  const daysParam = req.nextUrl.searchParams.get("days");
  const parsedDays = daysParam ? parseInt(daysParam, 10) : 14;
  const days = (DISPLAY_WINDOW_OPTIONS as readonly number[]).includes(parsedDays)
    ? parsedDays
    : 14;

  const data = await getWeightTrend(userId, days);
  return NextResponse.json({ data });
});
