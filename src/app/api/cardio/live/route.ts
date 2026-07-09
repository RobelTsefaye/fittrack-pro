import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pushCardioLiveSampleSchema } from "@/features/cardio/schemas";

/** A sample older than this is treated as stale (e.g. the phone crashed or
 *  lost connectivity mid-session without ever pushing isRunning:false) —
 *  better to show "no live session" than a frozen last reading forever. */
const STALE_AFTER_MS = 15_000;

/**
 * Cross-device relay for live cardio data. An Apple Watch can only ever pair
 * with an iPhone (never an iPad — there is no WatchConnectivity session
 * between them), so a signed-in iPad has no direct way to receive the
 * Watch's live HR push that CardioLiveRelay.swift / cardio-live-context.tsx
 * handle on the phone. The phone POSTs every sample it receives here; any
 * other signed-in device polls GET to pick it up. See useCardioLive's
 * polling fallback for the client side of this.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sample = await prisma.cardioLiveSample.findUnique({
    where: { userId: session.user.id },
  });

  const isStale = !sample || Date.now() - sample.updatedAt.getTime() > STALE_AFTER_MS;

  return NextResponse.json({
    data:
      !sample || !sample.isRunning || isStale
        ? null
        : {
            isRunning: sample.isRunning,
            heartRate: sample.heartRate,
            activeCalories: sample.activeCalories,
            elapsedSeconds: sample.elapsedSeconds,
            zone: sample.zone ?? undefined,
          },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = pushCardioLiveSampleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  await prisma.cardioLiveSample.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...parsed.data },
    update: { ...parsed.data },
  });

  return NextResponse.json({ success: true });
}
