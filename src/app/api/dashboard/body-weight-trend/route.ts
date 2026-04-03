import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBodyWeightTrend } from "@/features/dashboard/queries";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const take = Math.min(
    60,
    Math.max(2, parseInt(req.nextUrl.searchParams.get("limit") ?? "14", 10))
  );

  const data = await getBodyWeightTrend(session.user.id, take);
  return NextResponse.json({ data });
}
