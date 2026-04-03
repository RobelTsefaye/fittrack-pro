import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { buildCoachContext } from "@/features/ai/context";

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await buildCoachContext(userId);

  return NextResponse.json({
    data,
    meta: { endpoint: "coach-context" },
  });
}
