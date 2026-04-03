import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { buildProgressReport } from "@/features/ai/context";
import { clampWeeks } from "@/features/ai/schemas";

export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weeks = clampWeeks(req.nextUrl.searchParams.get("weeks"), 12, 52);
  const data = await buildProgressReport(userId, weeks);

  return NextResponse.json({
    data,
    meta: {
      endpoint: "progress-report",
      weeks,
    },
  });
}
