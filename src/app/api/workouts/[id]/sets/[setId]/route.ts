import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateSetSchema } from "@/features/workouts/schemas";
import { epley1RM } from "@/lib/strength";
import { readJsonBody, requireUserId, withApi } from "@/lib/api/route-handler";

export const PATCH = withApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  // Bearer-token auth too — the Watch's set logging hits this directly
  // (see WatchConnectivityPlugin) and needs to work without the phone app
  // open.
  const userId = await requireUserId();

  const { id: workoutId, setId } = await params;

  const existing = await prisma.set.findFirst({
    where: {
      id: setId,
      workoutExercise: {
        workoutId,
        workout: { userId },
      },
    },
    include: {
      workoutExercise: { select: { exerciseId: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }

  const body = await readJsonBody(req);
  const parsed = updateSetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.isCompleted === true) {
    updateData.completedAt = new Date();
  } else if (parsed.data.isCompleted === false) {
    updateData.completedAt = null;
  }

  // FT-ERR-02: set update, rest-timer reset and PR reconciliation commit
  // together or not at all (a failure in the PR step used to leave the set
  // saved, the old record deleted and the client with a 500).
  const { set, personalRecord } = await prisma.$transaction(async (tx) => {
    const set = await tx.set.update({
      where: { id: setId },
      data: updateData,
    });

    // A newly-completed set starts a fresh rest period — any +/-15s nudge
    // carried over from the *previous* period (phone bar, Live Activity, or
    // Watch) would otherwise silently apply to this new one too.
    if (parsed.data.isCompleted === true && !existing.isCompleted) {
      await tx.workout.update({
        where: { id: workoutId },
        data: { restTimerAdjustSeconds: 0 },
      });
    }

    /** Always reconcile PR for this set so edits (incl. past sessions) stay consistent. */
    await tx.personalRecord.deleteMany({ where: { setId } });
    let personalRecord = false;
    if (
      set.isCompleted &&
      !set.isWarmup &&
      set.weight != null &&
      set.reps != null &&
      set.weight > 0 &&
      set.reps > 0
    ) {
      // Same decision as recordPersonalRecordIfBest (src/lib/personal-record.ts),
      // but on the transaction client, which that helper cannot take yet.
      const estimated1RM = epley1RM(set.weight, set.reps);
      if (estimated1RM > 0) {
        const best = await tx.personalRecord.findFirst({
          where: { userId, exerciseId: existing.workoutExercise.exerciseId },
          orderBy: { estimated1RM: "desc" },
        });
        const bestVal = best?.estimated1RM ?? 0;
        if (!(bestVal > 0 && estimated1RM <= bestVal)) {
          await tx.personalRecord.create({
            data: {
              userId,
              exerciseId: existing.workoutExercise.exerciseId,
              weight: set.weight,
              reps: set.reps,
              estimated1RM,
              setId: set.id,
            },
          });
          personalRecord = true;
        }
      }
    }
    return { set, personalRecord };
  });

  return NextResponse.json({ data: set, personalRecord });
});

export const DELETE = withApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  const userId = await requireUserId();

  const { id: workoutId, setId } = await params;

  const existing = await prisma.set.findFirst({
    where: {
      id: setId,
      workoutExercise: {
        workoutId,
        workout: { userId },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.personalRecord.deleteMany({ where: { setId } }),
    prisma.set.delete({ where: { id: setId } }),
  ]);

  return NextResponse.json({ success: true });
});
