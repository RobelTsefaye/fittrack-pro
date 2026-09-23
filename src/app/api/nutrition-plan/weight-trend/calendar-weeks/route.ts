import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getCalendarWeekHistory } from "@/features/health/weight-trend";

// Read-only. Monday–Sunday calendar-week buckets (not a rolling window) —
// for the "I review and adjust calories every Monday" workflow.
export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weeksParam = req.nextUrl.searchParams.get("weeks");
  const parsed = weeksParam ? parseInt(weeksParam, 10) : 6;
  const weeks = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 26) : 6;

  const data = await getCalendarWeekHistory(userId, weeks);
  return NextResponse.json({ data });
}
