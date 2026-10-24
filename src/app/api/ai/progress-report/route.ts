import { NextRequest, NextResponse } from "next/server";
import { buildProgressReport } from "@/features/ai/context";
import { clampWeeks } from "@/features/ai/schemas";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET(req: NextRequest) {
  const userId = await requireUserId();

  const weeks = clampWeeks(req.nextUrl.searchParams.get("weeks"), 12, 52);
  const data = await buildProgressReport(userId, weeks);

  return NextResponse.json({
    data,
    meta: {
      endpoint: "progress-report",
      weeks,
    },
  });
});
