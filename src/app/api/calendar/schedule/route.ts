import { NextRequest, NextResponse } from "next/server";
import { resolveUserIdForDataApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  computeTrainingSchedule,
  DEFAULT_HORIZON_DAYS,
} from "@/features/calendar/schedule";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const userId = await resolveUserIdForDataApi();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const today = params.get("today") ?? "";
  if (!DATE_ONLY_RE.test(today)) {
    return NextResponse.json({ error: "Invalid today parameter" }, { status: 400 });
  }
  const horizonRaw = Number(params.get("horizonDays") ?? DEFAULT_HORIZON_DAYS);
  const horizonDays = Number.isFinite(horizonRaw)
    ? Math.min(56, Math.max(1, Math.trunc(horizonRaw)))
    : DEFAULT_HORIZON_DAYS;

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { calendarSyncEnabled: true, trainingTimeMinutes: true },
  });
  const enabled = settings?.calendarSyncEnabled ?? false;

  return NextResponse.json({
    data: {
      enabled,
      timeMinutes: settings?.trainingTimeMinutes ?? 1080,
      horizonDays,
      events: enabled ? await computeTrainingSchedule(userId, today, horizonDays) : [],
    },
  });
}
