import { NextResponse } from "next/server";
import { computeRecovery, computeRecoveryHistory } from "@/features/health/recovery";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const dynamic = "force-dynamic";

export const GET = withApi(async function GET() {
  // Bearer-token auth too — the Watch's HealthDashboardView fetches this
  // directly (see WatchAPIProxy) and needs to work without the phone app
  // open, same as the workout endpoints.
  const userId = await requireUserId();

  const [recovery, history] = await Promise.all([
    computeRecovery(userId),
    computeRecoveryHistory(userId, 30),
  ]);
  return NextResponse.json({ data: recovery, history });
});
