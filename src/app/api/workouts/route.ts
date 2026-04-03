import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createWorkoutSchema } from "@/features/workouts/schemas";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const status = searchParams.get("status"); // "active" | "completed" | null

  const where: Record<string, unknown> = { userId: session.user.id };

  if (status === "active") {
    where.completedAt = null;
  } else if (status === "completed") {
    where.completedAt = { not: null };
  }

  const [workouts, total] = await Promise.all([
    prisma.workout.findMany({
      where,
      include: {
        workoutExercises: {
          include: {
            exercise: { select: { id: true, name: true, muscleGroup: true } },
            sets: true,
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.workout.count({ where }),
  ]);

  return NextResponse.json({
    data: workouts,
    meta: { page, limit, total },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createWorkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const workout = await prisma.workout.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name || null,
      startedAt: new Date(),
    },
    include: {
      workoutExercises: {
        include: {
          exercise: { select: { id: true, name: true, muscleGroup: true } },
          sets: true,
        },
      },
    },
  });

  return NextResponse.json({ data: workout }, { status: 201 });
}
