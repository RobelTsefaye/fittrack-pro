import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeRecovery, computeRecoveryHistory } from "@/features/health/recovery";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [recovery, history] = await Promise.all([
    computeRecovery(session.user.id),
    computeRecoveryHistory(session.user.id, 30),
  ]);
  return NextResponse.json({ data: recovery, history });
}
