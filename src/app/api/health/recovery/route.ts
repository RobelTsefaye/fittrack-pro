import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeRecovery } from "@/features/health/recovery";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recovery = await computeRecovery(session.user.id);
  return NextResponse.json({ data: recovery });
}
