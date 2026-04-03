import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { buildTrainingSummary } from "@/features/ai/context";
import { clampWeeks } from "@/features/ai/schemas";

export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weeks = clampWeeks(req.nextUrl.searchParams.get("weeks"), 8, 24);
  const data = await buildTrainingSummary(userId, weeks);

  return NextResponse.json({
    data,
    meta: {
      endpoint: "training-summary",
      weeks,
    },
  });
}
