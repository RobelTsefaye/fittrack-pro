import { NextRequest, NextResponse } from "next/server";
import {
  getVolumeBucketsMonthly,
  getVolumeBucketsWeekly,
} from "@/features/dashboard/queries";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET(req: NextRequest) {
  const userId = await requireUserId();

  const period = req.nextUrl.searchParams.get("period");
  const meta = { period: period === "month" ? "month" : "week" } as const;

  const data =
    meta.period === "month"
      ? await getVolumeBucketsMonthly(userId)
      : await getVolumeBucketsWeekly(userId);

  return NextResponse.json({ data, meta });
});
