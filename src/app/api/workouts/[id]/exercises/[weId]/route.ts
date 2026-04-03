import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; weId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workoutId, weId } = await params;

  const workout = await prisma.workout.findFirst({
    where: { id: workoutId, userId: session.user.id },
  });

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  const workoutExercise = await prisma.workoutExercise.findFirst({
    where: { id: weId, workoutId },
  });

  if (!workoutExercise) {
    return NextResponse.json({ error: "Exercise not found in workout" }, { status: 404 });
  }

  await prisma.workoutExercise.delete({ where: { id: weId } });

  return NextResponse.json({ success: true });
}
