import { NextResponse } from "next/server";
import { getConsistencyWeekly } from "@/features/dashboard/queries";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET() {
  const userId = await requireUserId();

  const data = await getConsistencyWeekly(userId);
  return NextResponse.json({ data });
});
