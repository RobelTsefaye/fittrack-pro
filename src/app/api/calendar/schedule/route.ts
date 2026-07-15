import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyOverrides, computeCardioSchedule, computeTrainingSchedule, DEFAULT_HORIZON_DAYS, getCalendarOverrides } from "@/features/calendar/schedule";
import type { CalendarKind } from "@/generated/prisma/client";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
async function scheduled(userId: string, kind: CalendarKind, today: string, horizonDays: number) {
  const entries = kind === "TRAINING" ? await computeTrainingSchedule(userId, today, horizonDays) : await computeCardioSchedule(userId, today, horizonDays);
  return applyOverrides(entries, await getCalendarOverrides(userId, kind, entries));
}
export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = req.nextUrl.searchParams.get("today") ?? "";
  if (!DATE_ONLY_RE.test(today)) return NextResponse.json({ error: "Invalid today parameter" }, { status: 400 });
  const raw = Number(req.nextUrl.searchParams.get("horizonDays") ?? DEFAULT_HORIZON_DAYS);
  const horizonDays = Number.isFinite(raw) ? Math.min(56, Math.max(1, Math.trunc(raw))) : DEFAULT_HORIZON_DAYS;
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { calendarSyncEnabled: true, cardioSyncEnabled: true } });
  const trainingEnabled = settings?.calendarSyncEnabled ?? false;
  const cardioEnabled = settings?.cardioSyncEnabled ?? false;
  return NextResponse.json({ data: {
    horizonDays,
    training: { enabled: trainingEnabled, calendarName: "FitTrack Pro", events: trainingEnabled ? await scheduled(userId, "TRAINING", today, horizonDays) : [] },
    cardio: { enabled: cardioEnabled, calendarName: "FitTrack Pro Cardio", events: cardioEnabled ? await scheduled(userId, "CARDIO", today, horizonDays) : [] },
  } });
}
