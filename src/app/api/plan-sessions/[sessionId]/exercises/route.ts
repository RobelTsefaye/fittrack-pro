import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { addPlanSessionExerciseSchema } from "@/features/plans/schemas";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const planSession = await prisma.planSession.findFirst({
    where: { id: sessionId, plan: { userId } },
  });
  if (!planSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = addPlanSessionExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const exercise = await prisma.exercise.findFirst({
    where: {
      id: parsed.data.exerciseId,
      OR: [{ userId }, { userId: null }],
    },
  });
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  const last = await prisma.planSessionExercise.findFirst({
    where: { planSessionId: sessionId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? -1) + 1;
  const targetSets = parsed.data.targetSets ?? 3;

  const created = await prisma.planSessionExercise.create({
    data: {
      planSessionId: sessionId,
      exerciseId: exercise.id,
      order,
      targetSets,
    },
    include: {
      exercise: {
        select: { id: true, name: true, muscleGroup: true, equipment: true },
      },
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
