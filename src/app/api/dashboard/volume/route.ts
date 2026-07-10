import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import {
  getVolumeBucketsMonthly,
  getVolumeBucketsWeekly,
} from "@/features/dashboard/queries";

export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = req.nextUrl.searchParams.get("period");
  const meta = { period: period === "month" ? "month" : "week" } as const;

  const data =
    meta.period === "month"
      ? await getVolumeBucketsMonthly(userId)
      : await getVolumeBucketsWeekly(userId);

  return NextResponse.json({ data, meta });
}
