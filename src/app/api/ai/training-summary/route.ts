import { NextRequest, NextResponse } from "next/server";
import { buildTrainingSummary } from "@/features/ai/context";
import { clampWeeks } from "@/features/ai/schemas";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET(req: NextRequest) {
  const userId = await requireUserId();

  const weeks = clampWeeks(req.nextUrl.searchParams.get("weeks"), 8, 24);
  const data = await buildTrainingSummary(userId, weeks);

  return NextResponse.json({
    data,
    meta: {
      endpoint: "training-summary",
      weeks,
    },
  });
});
