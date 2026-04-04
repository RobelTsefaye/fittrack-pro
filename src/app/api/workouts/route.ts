import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createWorkoutSchema } from "@/features/workouts/schemas";
import {
  getCachedWorkoutsListPage,
  getWorkoutsListUncached,
} from "@/features/workouts/workouts-list-data";
import { revalidateTag } from "next/cache";
import { dashboardCacheTag, workoutsListCacheTag } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const statusParam = searchParams.get("status");
  const statusFilter: "active" | "completed" | null =
    statusParam === "active" || statusParam === "completed" ? statusParam : null;

  const useCache = page === 1 && limit === 50 && statusFilter === null;

  if (useCache) {
    const { items, total } = await getCachedWorkoutsListPage(session.user.id);
    return NextResponse.json({
      data: items,
      meta: { page: 1, limit: 50, total },
    });
  }

  const { items, total } = await getWorkoutsListUncached(
    session.user.id,
    page,
    limit,
    statusFilter
  );

  return NextResponse.json({
    data: items,
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

  revalidateTag(dashboardCacheTag(session.user.id), "max");
  revalidateTag(workoutsListCacheTag(session.user.id), "max");

  return NextResponse.json({ data: workout }, { status: 201 });
}
