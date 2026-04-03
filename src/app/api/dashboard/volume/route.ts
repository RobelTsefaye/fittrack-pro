import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getVolumeBucketsMonthly,
  getVolumeBucketsWeekly,
} from "@/features/dashboard/queries";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = req.nextUrl.searchParams.get("period");
  const meta = { period: period === "month" ? "month" : "week" } as const;

  const data =
    meta.period === "month"
      ? await getVolumeBucketsMonthly(session.user.id)
      : await getVolumeBucketsWeekly(session.user.id);

  return NextResponse.json({ data, meta });
}
