import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dashboardCacheTag, workoutsListCacheTag } from "@/lib/constants";
import { recordPersonalRecordIfBest } from "@/lib/personal-record";

async function sumWorkoutVolume(workoutId: string): Promise<number> {
  const sets = await prisma.set.findMany({
    where: {
      workoutExercise: { workoutId },
      isWarmup: false,
      isCompleted: true,
      weight: { not: null },
      reps: { not: null },
    },
    select: { weight: true, reps: true },
  });
  return sets.reduce((sum, s) => sum + Number(s.weight) * (s.reps ?? 0), 0);
}

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

  const previousWorkout = await prisma.workout.findFirst({
    where: {
      userId: session.user.id,
      completedAt: { not: null },
      startedAt: { lt: workout.startedAt },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  const previousVolume = previousWorkout
    ? await sumWorkoutVolume(previousWorkout.id)
    : 0;

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

  let newPersonalRecords = 0;
  for (const s of setsForPr) {
    const result = await recordPersonalRecordIfBest({
      userId: session.user.id,
      exerciseId: s.workoutExercise.exerciseId,
      setId: s.id,
      weight: s.weight!,
      reps: s.reps!,
    });
    if (result.recorded) newPersonalRecords++;
  }

  const currentVolume = await sumWorkoutVolume(id);

  const volumeDelta = currentVolume - previousVolume;
  const volumeDeltaPct =
    previousVolume > 0 ? (volumeDelta / previousVolume) * 100 : null;

  revalidateTag(dashboardCacheTag(session.user.id), "max");
  revalidateTag(workoutsListCacheTag(session.user.id), "max");

  return NextResponse.json({
    data: updated,
    comparison: {
      hasPrevious: !!previousWorkout,
      previousVolume,
      currentVolume,
      volumeDelta,
      volumeDeltaPct,
    },
    newPersonalRecords,
  });
}
