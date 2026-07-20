import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plans = await prisma.workoutPlan.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      sessions: {
        orderBy: { order: "asc" },
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: {
              exercise: {
                select: { id: true, name: true, muscleGroup: true, equipment: true },
              },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    data: {
      schemaVersion: "1.0",
      kind: "plans",
      generatedAt: new Date().toISOString(),
      plans,
    },
    meta: { endpoint: "plans", count: plans.length },
  });
}
