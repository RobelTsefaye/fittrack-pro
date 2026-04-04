import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addSetSchema } from "@/features/workouts/schemas";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; weId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workoutId, weId } = await params;

  const workout = await prisma.workout.findFirst({
    where: { id: workoutId, userId: session.user.id, completedAt: null },
  });

  if (!workout) {
    return NextResponse.json(
      { error: "Workout not found or completed" },
      { status: 404 }
    );
  }

  const workoutExercise = await prisma.workoutExercise.findFirst({
    where: { id: weId, workoutId },
  });

  if (!workoutExercise) {
    return NextResponse.json(
      { error: "Exercise not in this workout" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const parsed = addSetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const isWarmup = parsed.data.isWarmup === true;

  if (isWarmup) {
    const existingCount = await prisma.set.count({
      where: { workoutExerciseId: weId },
    });

    if (existingCount > 0) {
      await prisma.set.updateMany({
        where: { workoutExerciseId: weId },
        data: { setNumber: { increment: 1 } },
      });
    }

    const set = await prisma.set.create({
      data: {
        workoutExerciseId: weId,
        setNumber: 1,
        isWarmup: true,
        reps: parsed.data.reps,
        weight: parsed.data.weight,
        durationSeconds: parsed.data.durationSeconds,
        rpe: parsed.data.rpe,
      },
    });

    const sets = await prisma.set.findMany({
      where: { workoutExerciseId: weId },
      orderBy: { setNumber: "asc" },
    });

    return NextResponse.json({ data: { set, sets } }, { status: 201 });
  }

  const lastSet = await prisma.set.findFirst({
    where: { workoutExerciseId: weId },
    orderBy: { setNumber: "desc" },
  });

  const set = await prisma.set.create({
    data: {
      workoutExerciseId: weId,
      setNumber: (lastSet?.setNumber ?? 0) + 1,
      ...parsed.data,
    },
  });

  return NextResponse.json({ data: { set } }, { status: 201 });
}
