import { NextResponse } from "next/server";
import { getDashboardSummary } from "@/features/dashboard/queries";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET() {
  const userId = await requireUserId();

  const data = await getDashboardSummary(userId);
  return NextResponse.json({ data });
});
