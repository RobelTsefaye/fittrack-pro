import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, withApi } from "@/lib/api/route-handler";

export const GET = withApi(async function GET() {
  const userId = await requireUserId();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      settings: true,
      bodyWeights: { orderBy: { date: "desc" } },
      exercises: true,
      workouts: {
        orderBy: { startedAt: "desc" },
        include: {
          workoutExercises: {
            orderBy: { order: "asc" },
            include: {
              exercise: {
                select: {
                  id: true,
                  name: true,
                  muscleGroup: true,
                  equipment: true,
                },
              },
              sets: { orderBy: { setNumber: "asc" } },
            },
          },
        },
      },
      personalRecords: {
        orderBy: { achievedAt: "desc" },
        include: {
          exercise: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: user,
    meta: { exportedAt: new Date().toISOString(), format: "json" },
  });
});
