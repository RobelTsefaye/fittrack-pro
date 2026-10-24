import { NextRequest, NextResponse } from "next/server";
import { getWorkoutsListUncached } from "@/features/workouts/workouts-list-data";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET(req: NextRequest) {
  const userId = await requireUserId();

  const searchParams = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const statusParam = searchParams.get("status");
  const status = statusParam === "active" || statusParam === "completed" ? statusParam : null;

  const { items, total } = await getWorkoutsListUncached(userId, page, limit, status);

  return NextResponse.json({
    data: {
      schemaVersion: "1.0",
      kind: "workouts",
      generatedAt: new Date().toISOString(),
      workouts: items,
    },
    meta: { endpoint: "workouts", page, limit, total, status },
  });
});
