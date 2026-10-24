import { NextResponse } from "next/server";
import { buildCoachContext } from "@/features/ai/context";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET() {
  const userId = await requireUserId();

  const data = await buildCoachContext(userId);

  return NextResponse.json({
    data,
    meta: { endpoint: "coach-context" },
  });
});
