import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateSetSchema } from "@/features/workouts/schemas";
import {
  recordPersonalRecordIfBest,
  removePersonalRecordForSet,
} from "@/lib/personal-record";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workoutId, setId } = await params;

  const existing = await prisma.set.findFirst({
    where: {
      id: setId,
      workoutExercise: {
        workoutId,
        workout: { userId: session.user.id },
      },
    },
    include: {
      workoutExercise: { select: { exerciseId: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateSetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.isCompleted === true) {
    updateData.completedAt = new Date();
  } else if (parsed.data.isCompleted === false) {
    updateData.completedAt = null;
  }

  const set = await prisma.set.update({
    where: { id: setId },
    data: updateData,
  });

  /** Always reconcile PR for this set so edits (incl. past sessions) stay consistent. */
  await removePersonalRecordForSet(setId);
  if (
    set.isCompleted &&
    !set.isWarmup &&
    set.weight != null &&
    set.reps != null &&
    set.weight > 0 &&
    set.reps > 0
  ) {
    await recordPersonalRecordIfBest({
      userId: session.user.id,
      exerciseId: existing.workoutExercise.exerciseId,
      setId: set.id,
      weight: set.weight,
      reps: set.reps,
    });
  }

  return NextResponse.json({ data: set });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workoutId, setId } = await params;

  const existing = await prisma.set.findFirst({
    where: {
      id: setId,
      workoutExercise: {
        workoutId,
        workout: { userId: session.user.id },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }

  await prisma.personalRecord.deleteMany({ where: { setId } });
  await prisma.set.delete({ where: { id: setId } });

  return NextResponse.json({ success: true });
}
