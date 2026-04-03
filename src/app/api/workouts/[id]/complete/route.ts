import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordPersonalRecordIfBest } from "@/lib/personal-record";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workout = await prisma.workout.findFirst({
    where: { id, userId: session.user.id, completedAt: null },
  });

  if (!workout) {
    return NextResponse.json(
      { error: "Workout not found or already completed" },
      { status: 404 }
    );
  }

  const now = new Date();
  const durationSeconds = Math.round(
    (now.getTime() - workout.startedAt.getTime()) / 1000
  );

  const updated = await prisma.workout.update({
    where: { id },
    data: {
      completedAt: now,
      durationSeconds,
    },
  });

  // Mark working sets as completed so history/volume/PRs match "Finish workout" UX.
  await prisma.set.updateMany({
    where: {
      isWarmup: false,
      reps: { gt: 0 },
      isCompleted: false,
      workoutExercise: { workoutId: id },
    },
    data: {
      isCompleted: true,
      completedAt: now,
    },
  });

  const setsForPr = await prisma.set.findMany({
    where: {
      workoutExercise: { workoutId: id },
      isWarmup: false,
      isCompleted: true,
      weight: { gt: 0 },
      reps: { gt: 0 },
    },
    include: {
      workoutExercise: { select: { exerciseId: true } },
    },
  });

  for (const s of setsForPr) {
    await recordPersonalRecordIfBest({
      userId: session.user.id,
      exerciseId: s.workoutExercise.exerciseId,
      setId: s.id,
      weight: s.weight!,
      reps: s.reps!,
    });
  }

  return NextResponse.json({ data: updated });
}
