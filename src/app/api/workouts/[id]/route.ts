import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dashboardCacheTag, workoutsListCacheTag } from "@/lib/constants";
import { updateWorkoutSchema } from "@/features/workouts/schemas";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workout = await prisma.workout.findFirst({
    where: { id, userId: session.user.id },
    include: {
      workoutExercises: {
        include: {
          exercise: { select: { id: true, name: true, muscleGroup: true, equipment: true } },
          sets: { orderBy: { setNumber: "asc" } },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  return NextResponse.json({ data: workout });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workout = await prisma.workout.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateWorkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updated = await prisma.workout.update({
    where: { id },
    data: {
      ...parsed.data,
      notes: parsed.data.notes ?? undefined,
    },
  });

  revalidateTag(dashboardCacheTag(session.user.id), "max");
  revalidateTag(workoutsListCacheTag(session.user.id), "max");

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workout = await prisma.workout.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  if (!workout.completedAt) {
    return NextResponse.json(
      { error: "Only completed workouts can be deleted" },
      { status: 400 }
    );
  }

  await prisma.workout.delete({ where: { id } });

  revalidateTag(dashboardCacheTag(session.user.id), "max");
  revalidateTag(workoutsListCacheTag(session.user.id), "max");

  return NextResponse.json({ success: true });
}
