import { NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;

  const planSession = await prisma.planSession.findFirst({
    where: { id: sessionId, plan: { userId } },
    include: {
      exercises: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!planSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const startedAt = new Date();

  const workout = await prisma.$transaction(async (tx) => {
    const w = await tx.workout.create({
      data: {
        userId,
        name: planSession.name,
        planSessionId: planSession.id,
        startedAt,
      },
    });

    for (const pse of planSession.exercises) {
      const we = await tx.workoutExercise.create({
        data: {
          workoutId: w.id,
          exerciseId: pse.exerciseId,
          order: pse.order,
        },
      });
      for (let i = 1; i <= pse.targetSets; i++) {
        await tx.set.create({
          data: {
            workoutExerciseId: we.id,
            setNumber: i,
          },
        });
      }
    }

    return w;
  });

  return NextResponse.json({ data: { id: workout.id } }, { status: 201 });
}
