import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Server relay for live cardio (Laufen/Radfahren) data.
 *
 * An Apple Watch can only ever pair with one iPhone —
 * `WCSession.isSupported()` is unconditionally `false` on iPad, so
 * WatchConnectivity itself can never reach a device that isn't that paired
 * iPhone. This route is how any *other* signed-in device (an iPad, a second
 * iPhone) still gets to see the live view: the paired iPhone POSTs every
 * push it receives from the Watch here (see cardio-live-context.tsx), and
 * every device — including the paired iPhone itself, as a fallback — polls
 * GET to render it.
 *
 * One row per user, always overwritten — there's no history to keep here,
 * only "what's happening right now."
 */

// A device can go from "definitely still running" to "actually ended
// (app force-quit, network drop) with no final isRunning:false ever
// reaching the server" — without a cutoff, a stale row would show a frozen
// "still running" live view on other devices indefinitely. Comfortably
// above the ~1s push cadence so normal jitter never trips it.
const STALE_MS = 8_000;

const liveUpdateSchema = z.object({
  isRunning: z.boolean(),
  heartRate: z.number().min(0).max(300),
  activeCalories: z.number().min(0),
  elapsedSeconds: z.number().int().min(0),
  zone: z.number().int().min(1).max(5).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = liveUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { isRunning, heartRate, activeCalories, elapsedSeconds, zone } = parsed.data;

  await prisma.cardioLiveSnapshot.upsert({
    where: { userId },
    create: { userId, isRunning, heartRate, activeCalories, elapsedSeconds, zone: zone ?? null },
    update: { isRunning, heartRate, activeCalories, elapsedSeconds, zone: zone ?? null },
  });

  return NextResponse.json({ success: true });
}

export async function GET() {
  const userId = await resolveUserIdForDataApi();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snapshot = await prisma.cardioLiveSnapshot.findUnique({ where: { userId } });
  if (!snapshot) return NextResponse.json({ data: null });

  const isStale = Date.now() - snapshot.updatedAt.getTime() > STALE_MS;

  return NextResponse.json({
    data: {
      isRunning: isStale ? false : snapshot.isRunning,
      heartRate: snapshot.heartRate,
      activeCalories: snapshot.activeCalories,
      elapsedSeconds: snapshot.elapsedSeconds,
      zone: snapshot.zone,
    },
  });
}
