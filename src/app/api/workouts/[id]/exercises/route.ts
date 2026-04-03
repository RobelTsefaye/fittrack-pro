import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addExerciseToWorkoutSchema } from "@/features/workouts/schemas";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workoutId } = await params;

  const workout = await prisma.workout.findFirst({
    where: { id: workoutId, userId: session.user.id, completedAt: null },
  });

  if (!workout) {
    return NextResponse.json(
      { error: "Workout not found or already completed" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const parsed = addExerciseToWorkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Get the next order number
  const lastExercise = await prisma.workoutExercise.findFirst({
    where: { workoutId },
    orderBy: { order: "desc" },
  });

  const workoutExercise = await prisma.workoutExercise.create({
    data: {
      workoutId,
      exerciseId: parsed.data.exerciseId,
      order: (lastExercise?.order ?? 0) + 1,
    },
    include: {
      exercise: { select: { id: true, name: true, muscleGroup: true, equipment: true } },
      sets: true,
    },
  });

  return NextResponse.json({ data: workoutExercise }, { status: 201 });
}
