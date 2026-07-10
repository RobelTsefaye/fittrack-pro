import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { getConsistencyWeekly } from "@/features/dashboard/queries";

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getConsistencyWeekly(userId);
  return NextResponse.json({ data });
}
