import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { computeRecovery, computeRecoveryHistory } from "@/features/health/recovery";

export const dynamic = "force-dynamic";

export async function GET() {
  // Bearer-token auth too — the Watch's HealthDashboardView fetches this
  // directly (see WatchAPIProxy) and needs to work without the phone app
  // open, same as the workout endpoints.
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [recovery, history] = await Promise.all([
    computeRecovery(userId),
    computeRecoveryHistory(userId, 30),
  ]);
  return NextResponse.json({ data: recovery, history });
}
