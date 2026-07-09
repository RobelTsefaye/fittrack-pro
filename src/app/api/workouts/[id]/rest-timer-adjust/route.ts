import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { adjustRestTimerSchema } from "@/features/workouts/schemas";

/**
 * Persists a +/-15s rest-timer nudge server-side so every surface (phone
 * bar, Live Activity, Watch) that independently derives its own countdown
 * from workout data (see computeRestTimerEndsAt in watch-connectivity.ts and
 * WatchAPIProxy.swift) adds the same adjustment on top — a nudge made from
 * any one of them is reflected on the others on next sync, instead of each
 * tracking its own disconnected local overlay.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Bearer-token auth too — the Watch's own +/-15 buttons hit this directly
  // (see WatchConnectivityPlugin) and need to work without the phone app open.
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.workout.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = adjustRestTimerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updated = await prisma.workout.update({
    where: { id },
    data: { restTimerAdjustSeconds: { increment: parsed.data.deltaSeconds } },
    select: { restTimerAdjustSeconds: true },
  });

  return NextResponse.json({ data: updated });
}
