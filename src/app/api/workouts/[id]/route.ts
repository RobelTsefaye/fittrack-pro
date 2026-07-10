import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { dashboardCacheTag, workoutsListCacheTag, DEFAULT_REST_TIMER } from "@/lib/constants";
import { updateWorkoutSchema } from "@/features/workouts/schemas";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Bearer-token auth too — GET is also used to fetch a workout's detail
  // right after the Watch starts one via plan-sessions/:id/start, which
  // needs to work without the phone app open (see WatchConnectivityPlugin).
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [workout, settings] = await Promise.all([
    prisma.workout.findFirst({
      where: { id, userId },
      include: {
        workoutExercises: {
          include: {
            exercise: { select: { id: true, name: true, muscleGroup: true, equipment: true } },
            sets: { orderBy: { setNumber: "asc" } },
          },
          orderBy: { order: "asc" },
        },
      },
    }),
    // Included here (not just read separately by the phone's own settings
    // fetch) so the Watch — via either the JS sync or the native no-phone-
    // open proxy, neither of which has its own access to user settings —
    // computes the rest timer from the user's actual configured duration
    // instead of a hardcoded default. Previously hardcoded to
    // DEFAULT_REST_TIMER (90s) on both the JS and native side, silently
    // diverging from whatever the user had set in Settings.
    prisma.userSettings.findUnique({ where: { userId }, select: { restTimerDefault: true } }),
  ]);

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: { ...workout, restTimerDefaultSeconds: settings?.restTimerDefault ?? DEFAULT_REST_TIMER },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workout = await prisma.workout.findFirst({
    where: { id, userId },
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

  revalidateTag(dashboardCacheTag(userId), "max");
  revalidateTag(workoutsListCacheTag(userId), "max");

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Bearer-token auth too — the Watch's "Workout abbrechen" hits this
  // directly (see WatchConnectivityPlugin) and needs to work without the
  // phone app open.
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workout = await prisma.workout.findFirst({
    where: { id, userId },
  });

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  await prisma.workout.delete({ where: { id } });

  revalidateTag(dashboardCacheTag(userId), "max");
  revalidateTag(workoutsListCacheTag(userId), "max");

  return NextResponse.json({ success: true });
}
